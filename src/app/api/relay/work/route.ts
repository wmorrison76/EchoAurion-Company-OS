import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { upsertSupportClientByKey } from '@/lib/relay-heartbeat'
import { COMPLEXITY_TIERS, computeQuote } from '@/lib/pricing'
import {
  canRequestBuild,
  buildRoleGateMessage,
  normalizePilotRole,
} from '@/lib/work-roles'
import { validateAgreementInput } from '@/lib/work-agreement'
import type { APIResponse } from '@/types'
import type { Quote } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

const agreementSchema = z.object({
  agreed: z.boolean(),
  typedSignature: z.string().min(1).max(120),
  signerName: z.string().min(1).max(120),
  signerEmail: z.string().email().optional().nullable(),
  signerRole: z.string().min(1).max(40),
})

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  kind: z.enum(['FIX', 'ADDON']).default('FIX'),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(8000),
  requesterName: z.string().max(200).optional(),
  requesterRole: z.string().max(100).optional(),
  /** Optional customer-suggested tier for quote preview freeze (paid-via-profile). */
  tier: z.enum(COMPLEXITY_TIERS).optional(),
  humanHours: z.number().positive().max(500).optional(),
  context: z.record(z.unknown()).optional(),
  /** When present, creates WorkAgreement (ADMIN/DIRECTOR/EXEC only). */
  agreement: agreementSchema.optional(),
})

// A customer submits a billable change request from inside support. Logged as
// RECEIVED (or QUOTED when agreement+tier present). Never auto-executed.
export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'work')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid work request', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const d = parsed.data
    const key = requireClientKey(d.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }

    let quote: Quote | null = null
    let agreementRole: string | null = null

    if (d.agreement) {
      if (!canRequestBuild(d.agreement.signerRole)) {
        return Response.json(
          {
            success: false,
            error: buildRoleGateMessage(d.agreement.signerRole),
            code: 'ROLE_GATE',
          },
          { status: 403 }
        )
      }
      const agreementCheck = validateAgreementInput({
        role: d.agreement.signerRole,
        signerName: d.agreement.signerName,
        typedSignature: d.agreement.typedSignature,
        agreed: d.agreement.agreed,
      })
      if (!agreementCheck.ok) {
        return Response.json(
          { success: false, error: agreementCheck.error, code: 'AGREEMENT_INVALID' },
          { status: 400 }
        )
      }
      agreementRole = normalizePilotRole(d.agreement.signerRole)
      const tier = d.tier ?? 'T2'
      quote = computeQuote(tier, d.humanHours)
    }

    const client = await upsertSupportClientByKey(key.clientKey)
    const created = await db.workRequest.create({
      data: {
        clientKey: key.clientKey,
        clientId: client.id,
        kind: d.kind,
        title: d.title,
        detail: d.detail,
        requesterName: d.requesterName ?? d.agreement?.signerName ?? null,
        requesterRole:
          agreementRole ?? d.requesterRole ?? null,
        tier: quote?.tier ?? d.tier ?? null,
        humanHours: quote?.humanHours ?? null,
        quoteTotal: quote?.total ?? null,
        quoteSnapshot: quote
          ? (quote as unknown as Prisma.InputJsonValue)
          : undefined,
        status: quote ? 'QUOTED' : 'RECEIVED',
        quotedAt: quote ? new Date() : null,
        context: (d.context ?? undefined) as Prisma.InputJsonValue | undefined,
        actor: 'computer_agent',
      },
    })

    let agreementId: string | null = null
    if (d.agreement && agreementRole && quote) {
      const agreement = await db.workAgreement.create({
        data: {
          workRequestId: created.id,
          signerName: d.agreement.signerName.trim(),
          signerEmail: d.agreement.signerEmail?.trim() || null,
          signerRole: agreementRole,
          typedSignature: d.agreement.typedSignature.trim(),
          quoteTotal: quote.total,
          source: 'relay',
        },
      })
      agreementId = agreement.id
      await audit('computer_agent', 'work.agreement.create', agreement.id, {
        workRequestId: created.id,
        source: 'relay',
        signerRole: agreementRole,
      })
    }

    await audit('computer_agent', 'work.request.receive', created.id, {
      kind: d.kind,
      hasAgreement: Boolean(agreementId),
      tier: quote?.tier ?? null,
    })
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: `New ${d.kind === 'ADDON' ? 'add-on' : 'fix'} request: ${d.title}`,
      body: `${client.clientKey}${d.requesterName || d.agreement?.signerName ? ` — ${d.requesterName ?? d.agreement?.signerName}` : ''}${quote ? ` · ${quote.tier} ${quote.total} USD` : ''}`,
      entityRef: created.id,
      url: '/support/inbox',
    })

    return Response.json(
      {
        success: true,
        data: {
          id: created.id,
          status: created.status,
          agreementId,
          quote,
        },
      } satisfies APIResponse<{
        id: string
        status: string
        agreementId: string | null
        quote: Quote | null
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Work submit failed',
        code: 'WORK_FAILED',
      },
      { status: 500 }
    )
  }
}
