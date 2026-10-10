import { z } from 'zod'
import { createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { analyzeIncumbentSchema } from '@/lib/incumbent-schema-gap'

export const dynamic = 'force-dynamic'

const field = z.object({
  path: z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_.\[\]-]*$/),
  kind: z.enum(['string', 'number', 'boolean', 'array', 'object', 'null', 'unknown']),
}).strict()

/**
 * DrOS-only, operator-reviewed schema-metadata intake.
 * This endpoint does NOT contact MEWS, authenticate to a provider, accept
 * live record values, certify Exodus or execute any generated code.
 */
const inputSchema = z.object({
  clientKey: z.string().min(1).max(128),
  providerKey: z.string().min(2).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  facilityKey: z.string().min(1).max(96).regex(/^[A-Za-z0-9_-]+$/),
  apiVersion: z.string().max(80).nullable(),
  adapterVersion: z.string().min(1).max(96).regex(/^[A-Za-z0-9._+/-]+$/),
  fields: z.array(field).min(1).max(500),
  mappedPaths: z.array(field.shape.path).max(500),
  criticalPaths: z.array(field.shape.path).max(500).optional(),
}).strict()

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let input: z.infer<typeof inputSchema>
  try {
    const raw = await req.text()
    if (raw.length > 80_000) {
      return Response.json({ success: false, error: 'Metadata inventory too large' }, { status: 413 })
    }
    const parsed = inputSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid field metadata (no record values permitted)' }, { status: 400 })
    }
    input = parsed.data
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // The tenant must already exist in the support registry. Never auto-create
    // clients from an untrusted provider observation.
    const client = await db.supportClient.findUnique({ where: { clientKey: input.clientKey } })
    if (!client) return Response.json({ success: false, error: 'Unknown installation' }, { status: 404 })

    // Derive drift from this installation's actual stored observation history,
    // not a caller-provided "previous" schema. A caller must not erase breakage
    // by submitting a convenient prior shape.
    const last = await db.incumbentSchemaObservation.findFirst({
      where: {
        clientKey: input.clientKey,
        providerKey: input.providerKey,
        facilityKey: input.facilityKey,
      },
      orderBy: { lastObservedAt: 'desc' },
      select: { fieldDescriptors: true },
    })
    const prior = last ? z.array(field).max(500).safeParse(last.fieldDescriptors) : null
    if (prior && !prior.success) {
      return Response.json({
        success: false,
        error: 'Stored schema history invalid; manual review required',
      }, { status: 503 })
    }
    const report = analyzeIncumbentSchema({
      ...input,
      previousFields: prior?.success ? prior.data : [],
    })
    // Append a versioned integration passport even when no new gap exists.
    // This metadata is not evidence of a live/provider-authenticated connection.
    const observationKey = createHash('sha256')
      .update(JSON.stringify([
        input.clientKey, input.providerKey, input.facilityKey,
        input.apiVersion, input.adapterVersion, report.schemaHash,
      ])).digest('hex')
    await db.incumbentSchemaObservation.upsert({
      where: { observationKey },
      create: {
        observationKey,
        clientKey: input.clientKey,
        providerKey: input.providerKey,
        facilityKey: input.facilityKey,
        apiVersion: input.apiVersion,
        adapterVersion: input.adapterVersion,
        schemaHash: report.schemaHash,
        fieldCount: report.fieldCount,
        fieldDescriptors: [...input.fields].sort((a, b) => a.path.localeCompare(b.path)),
        sourceVerified: false,
        connectionVerifiedAt: null,
      },
      update: { lastObservedAt: new Date() },
    })
    if (report.status === 'NO_GAP') {
      return Response.json({
        success: true,
        data: { report, created: false, ticketId: null, workRequestId: null },
      })
    }

    // Fingerprint uses only provider, facility, and sanitized schema metadata.
    // Transaction-scoped lock serializes duplicate observations without a migration.
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${report.fingerprint}))`
      const existing = await tx.helpTicket.findFirst({
        where: { clientKey: input.clientKey, channel: 'SYSTEM', fingerprint: report.fingerprint },
        select: { id: true, workRequestId: true },
      })
      if (existing) {
        return { created: false, ticketId: existing.id, workRequestId: existing.workRequestId }
      }

      const title = ('Incumbent capability gap: ' + input.providerKey + ' / ' + input.facilityKey).slice(0, 160)
      const detail = JSON.stringify({
        status: report.status,
        apiVersion: report.apiVersion,
        adapterVersion: report.adapterVersion,
        schemaHash: report.schemaHash,
        unmapped: report.unmapped,
        removed: report.removed,
        typeChanged: report.typeChanged,
        criticalGaps: report.criticalGaps,
        missingCritical: report.missingCritical,
        acceptance: 'Human-reviewed mapping, bounded tests, verified source, Exodus off-provider continuity',
      })
      const work = await tx.workRequest.create({
        data: {
          clientKey: input.clientKey,
          clientId: client.id,
          kind: 'FIX',
          title,
          detail,
          status: 'RECEIVED',
          actor: 'computer_agent',
          context: {
            source: 'incumbent_schema_metadata',
            providerKey: input.providerKey,
            facilityKey: input.facilityKey,
            observedAt: new Date().toISOString(),
            apiVersion: input.apiVersion,
            adapterVersion: input.adapterVersion,
            schemaHash: report.schemaHash,
            fingerprint: report.fingerprint,
            sourceVerified: false,
            continuityCertified: false,
            sourceConnectionStatus: 'UNVERIFIED_METADATA_SUBMISSION',
            rAndD: {
              costClassification: 'INTERNAL_RD',
              glAccount: null,
              glPostingAuthorized: false,
              actualCostVerified: false,
            },
          },
        },
      })
      const ticket = await tx.helpTicket.create({
        data: {
          channel: 'SYSTEM',
          status: 'OPEN',
          priority: report.status === 'BREAKING_REVIEW' || report.criticalGaps.length ? 'HIGH' : 'NORMAL',
          subject: title,
          clientKey: input.clientKey,
          clientId: client.id,
          workRequestId: work.id,
          fingerprint: report.fingerprint,
          moduleHint: 'incumbent_capability_gap',
          productLine: 'echoaurion',
          notifyWhenFixed: false,
          messages: {
            create: [{
              role: 'SYSTEM',
              body: 'Read-only schema gap detected. ' + detail.slice(0, 5000) +
                '. Knights must review; this is not a certified mapping, a verified MEWS sync, or an approved build.',
            }],
          },
        },
      })
      return { created: true, ticketId: ticket.id, workRequestId: work.id }
    })

    if (result.created) {
      await audit('computer_agent', 'incumbent.capability_gap.detected', result.workRequestId ?? undefined, {
        clientKey: input.clientKey,
        providerKey: input.providerKey,
        schemaHash: report.schemaHash,
        unmapped: report.unmapped.length,
        removed: report.removed.length,
        typeChanged: report.typeChanged.length,
        missingCritical: report.missingCritical.length,
      }).catch(() => { /* Detection stays visible if audit service is unavailable. */ })
    }
    return Response.json({ success: true, data: { report, ...result } })
  } catch (err) {
    const kind = err instanceof Error && /^(OBSERVATION|PREVIOUS|MAPPINGS|CRITICAL_PATHS)_/.test(err.message)
      ? 'Invalid or duplicate schema paths' : 'Capability gap intake unavailable'
    return Response.json({ success: false, error: kind }, { status: kind.startsWith('Invalid') ? 400 : 503 })
  }
}


/** DrOS integration-passport history. Owner session only, metadata only. */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const clientKey = url.searchParams.get('clientKey') ?? ''
  const providerKey = url.searchParams.get('providerKey') ?? ''
  if (!clientKey || clientKey.length > 128 ||
      !/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(providerKey)) {
    return Response.json({ success: false, error: 'clientKey and providerKey required' }, { status: 400 })
  }
  try {
    const client = await db.supportClient.findUnique({ where: { clientKey }, select: { id: true } })
    if (!client) return Response.json({ success: false, error: 'Unknown installation' }, { status: 404 })
    const observations = await db.incumbentSchemaObservation.findMany({
      where: { clientKey, providerKey },
      orderBy: { lastObservedAt: 'desc' },
      take: 100,
      select: {
        id: true, providerKey: true, facilityKey: true,
        apiVersion: true, adapterVersion: true, schemaHash: true,
        fieldCount: true, sourceVerified: true, connectionVerifiedAt: true,
        firstObservedAt: true, lastObservedAt: true,
      },
    })
    return Response.json({
      success: true,
      data: { observations, note: 'First observed does not imply first authenticated connection.' },
    })
  } catch {
    return Response.json({ success: false, error: 'Integration passport history unavailable' }, { status: 503 })
  }
}
