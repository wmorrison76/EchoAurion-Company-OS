/**
 * Help Desk screenshot attachments — validate, EXIF-strip, store as DB bytes.
 * Never log raw image bytes. Prefer Help Desk + screenshots over Bugbot Autofix for cost.
 */

import { db } from '@/lib/db'
import type { HelpAttachmentView } from '@/types/help-desk'

/** Max screenshots per question (pilot Help Desk). */
export const HELP_ATTACHMENT_MAX_COUNT = 2
/** Max decoded size per image after client compress (~1.5 MiB). */
export const HELP_ATTACHMENT_MAX_BYTES = 1_572_864
/** Retention target for purge jobs (documented; not auto-enforced yet). */
export const HELP_ATTACHMENT_RETENTION_DAYS = 90

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'] as const)
type AllowedMime = 'image/png' | 'image/jpeg' | 'image/webp'

export interface IncomingAttachment {
  mimeType: string
  dataBase64: string
  fileName?: string
  altText?: string
  widthPx?: number
  heightPx?: number
}

export interface AttachmentMeta {
  id: string
  mimeType: string
  fileName: string | null
  altText: string | null
  byteSize: number
  widthPx: number | null
  heightPx: number | null
  createdAt: string
}

export function toAttachmentView(a: {
  id: string
  mimeType: string
  fileName: string | null
  altText: string | null
  byteSize: number
  widthPx: number | null
  heightPx: number | null
  createdAt: Date
}): HelpAttachmentView {
  return {
    id: a.id,
    mimeType: a.mimeType,
    fileName: a.fileName,
    altText: a.altText,
    byteSize: a.byteSize,
    widthPx: a.widthPx,
    heightPx: a.heightPx,
    createdAt: a.createdAt.toISOString(),
    /** Auth'd operator fetch — never embed bytes in list JSON. */
    thumbUrl: `/api/help-desk/attachments/${a.id}`,
  }
}

/** Redacted log payload — ids/sizes only, never base64/bytes. */
export function attachmentAuditMeta(
  rows: Array<{ id: string; mimeType: string; byteSize: number }>
): { count: number; items: Array<{ id: string; mimeType: string; byteSize: number }> } {
  return {
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
    })),
  }
}

function normalizeMime(raw: string): AllowedMime | null {
  const m = raw.trim().toLowerCase()
  if (m === 'image/jpg') return 'image/jpeg'
  if (ALLOWED_MIME.has(m as AllowedMime)) return m as AllowedMime
  return null
}

function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/** Strip JPEG APP1 (EXIF) markers. PNG/WebP typically have no EXIF after canvas re-encode. */
export function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]
  let i = 2
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) {
      parts.push(buf.subarray(i))
      break
    }
    const marker = buf[i + 1]
    if (marker === 0xda) {
      // SOS — copy rest (never spread large subarrays into push — stack overflow).
      parts.push(buf.subarray(i))
      break
    }
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]))
      break
    }
    // Standalone markers
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buf.subarray(i, i + 2))
      i += 2
      continue
    }
    const len = (buf[i + 2]! << 8) | buf[i + 3]!
    if (len < 2 || i + 2 + len > buf.length) {
      parts.push(buf.subarray(i))
      break
    }
    // Skip APP1 (EXIF / XMP)
    if (marker !== 0xe1) {
      parts.push(buf.subarray(i, i + 2 + len))
    }
    i += 2 + len
  }
  return Buffer.concat(parts)
}

function decodeBase64Payload(raw: string): Buffer | null {
  const trimmed = raw.trim()
  const comma = trimmed.indexOf(',')
  const b64 =
    trimmed.startsWith('data:') && comma >= 0 ? trimmed.slice(comma + 1) : trimmed
  if (!b64 || b64.length > HELP_ATTACHMENT_MAX_BYTES * 2) return null
  try {
    const buf = Buffer.from(b64, 'base64')
    if (buf.length === 0 || buf.length > HELP_ATTACHMENT_MAX_BYTES) return null
    return buf
  } catch {
    return null
  }
}

type PreparedAttachment = {
  mimeType: AllowedMime
  data: Buffer
  fileName: string | null
  altText: string | null
  widthPx: number | null
  heightPx: number | null
  byteSize: number
}

export type ParseAttachmentsResult =
  | { ok: true; prepared: PreparedAttachment[] }
  | { ok: false; error: string; code: string }

export function parseIncomingAttachments(
  input: IncomingAttachment[] | undefined | null
): ParseAttachmentsResult {
  if (input == null || input.length === 0) {
    return { ok: true, prepared: [] }
  }
  if (input.length > HELP_ATTACHMENT_MAX_COUNT) {
    return {
      ok: false,
      error: `At most ${HELP_ATTACHMENT_MAX_COUNT} screenshots allowed`,
      code: 'ATTACHMENTS_TOO_MANY',
    }
  }

  const prepared: PreparedAttachment[] = []

  for (let idx = 0; idx < input.length; idx++) {
    const item = input[idx]!
    const declared = normalizeMime(item.mimeType ?? '')
    if (!declared) {
      return {
        ok: false,
        error: `Screenshot ${idx + 1}: PNG, JPEG, or WebP only`,
        code: 'ATTACHMENT_MIME',
      }
    }
    const raw = decodeBase64Payload(item.dataBase64 ?? '')
    if (!raw) {
      return {
        ok: false,
        error: `Screenshot ${idx + 1}: invalid or too large (max ${HELP_ATTACHMENT_MAX_BYTES} bytes)`,
        code: 'ATTACHMENT_SIZE',
      }
    }
    const sniffed = sniffMime(raw)
    if (!sniffed || sniffed !== declared) {
      return {
        ok: false,
        error: `Screenshot ${idx + 1}: file content does not match declared type`,
        code: 'ATTACHMENT_SNIFF',
      }
    }
    const data = sniffed === 'image/jpeg' ? stripJpegExif(raw) : raw
    if (data.length > HELP_ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        error: `Screenshot ${idx + 1}: exceeds ${HELP_ATTACHMENT_MAX_BYTES} bytes after processing`,
        code: 'ATTACHMENT_SIZE',
      }
    }
    const alt =
      typeof item.altText === 'string' && item.altText.trim()
        ? item.altText.trim().slice(0, 200)
        : `Screenshot ${idx + 1}`
    const fileName =
      typeof item.fileName === 'string' && item.fileName.trim()
        ? item.fileName.trim().slice(0, 200)
        : null
    const widthPx =
      typeof item.widthPx === 'number' &&
      Number.isFinite(item.widthPx) &&
      item.widthPx > 0 &&
      item.widthPx <= 10000
        ? Math.round(item.widthPx)
        : null
    const heightPx =
      typeof item.heightPx === 'number' &&
      Number.isFinite(item.heightPx) &&
      item.heightPx > 0 &&
      item.heightPx <= 10000
        ? Math.round(item.heightPx)
        : null

    prepared.push({
      mimeType: sniffed,
      data,
      fileName,
      altText: alt,
      widthPx,
      heightPx,
      byteSize: data.length,
    })
  }

  return { ok: true, prepared }
}

export async function persistAttachments(opts: {
  customerQuestionId: string
  ticketId?: string | null
  prepared: Array<{
    mimeType: string
    data: Buffer
    fileName: string | null
    altText: string | null
    widthPx: number | null
    heightPx: number | null
    byteSize: number
  }>
}): Promise<AttachmentMeta[]> {
  if (opts.prepared.length === 0) return []
  const created = await Promise.all(
    opts.prepared.map((p) =>
      db.helpAttachment.create({
        data: {
          customerQuestionId: opts.customerQuestionId,
          ticketId: opts.ticketId ?? undefined,
          mimeType: p.mimeType,
          fileName: p.fileName,
          altText: p.altText,
          byteSize: p.byteSize,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
          data: p.data,
        },
        select: {
          id: true,
          mimeType: true,
          fileName: true,
          altText: true,
          byteSize: true,
          widthPx: true,
          heightPx: true,
          createdAt: true,
        },
      })
    )
  )
  return created.map((a) => ({
    id: a.id,
    mimeType: a.mimeType,
    fileName: a.fileName,
    altText: a.altText,
    byteSize: a.byteSize,
    widthPx: a.widthPx,
    heightPx: a.heightPx,
    createdAt: a.createdAt.toISOString(),
  }))
}

/** Link question attachments to a HelpTicket once created. */
export async function linkAttachmentsToTicket(
  customerQuestionId: string,
  ticketId: string
): Promise<void> {
  await db.helpAttachment.updateMany({
    where: { customerQuestionId, ticketId: null },
    data: { ticketId },
  })
}

export async function loadAttachmentsForTicket(opts: {
  ticketId: string
  customerQuestionId?: string | null
}): Promise<HelpAttachmentView[]> {
  const rows = await db.helpAttachment.findMany({
    where: {
      OR: [
        { ticketId: opts.ticketId },
        ...(opts.customerQuestionId
          ? [{ customerQuestionId: opts.customerQuestionId }]
          : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      mimeType: true,
      fileName: true,
      altText: true,
      byteSize: true,
      widthPx: true,
      heightPx: true,
      createdAt: true,
    },
  })
  // Dedupe by id (OR can overlap)
  const seen = new Set<string>()
  const unique = rows.filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
  return unique.map(toAttachmentView)
}

/** Text block for Knights — no vision; do not invent UI from screenshots. */
export function attachmentPromptBlock(
  attachments: Array<{ altText: string | null; mimeType: string; byteSize: number }>
): string | null {
  if (!attachments.length) return null
  const n = attachments.length
  const lines = attachments.map((a, i) => {
    const alt = a.altText?.trim() || `Screenshot ${i + 1}`
    return `- ${i + 1}. ${alt} (${a.mimeType}, ${a.byteSize} bytes)`
  })
  return [
    `User attached ${n} screenshot${n === 1 ? '' : 's'}.`,
    'Text seats: do NOT invent UI details from screenshots you cannot see — say “see attachments in Help Desk” if visual confirmation is needed.',
    'Vision-capable seats (if configured later): may reference attachments; otherwise defer to Help Desk console.',
    ...lines,
  ].join('\n')
}
