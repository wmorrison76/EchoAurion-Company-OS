import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { upsertSupportClientByKey } from '@/lib/relay-heartbeat'
import {
  processInboundQuestion,
  shouldAutoKnightsOnQuestion,
} from '@/lib/help-desk-knights'
import { getStandbyConfig } from '@/lib/standby'
import { gateFromQuestionPayload, INTAKE_GATE_META } from '@/lib/intake-gate'
import { enforcePerTenantSecretIfSet } from '@/lib/tenant-ingest-secret'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  question: z.string().min(1).max(4000),
  context: z.record(z.unknown()).optional(),
  /** Pilot UI language code (en, es, ar, …) — merged into context.locale for Knights. */
  locale: z.string().min(2).max(16).optional(),
  gate: z.enum(['TECH', 'BILLING', 'BUILD', 'OTHER']).optional(),
  intakeGate: z.enum(['TECH', 'BILLING', 'BUILD', 'OTHER']).optional(),
})

/**
 * A deployment submits a customer question.
 * Creates CustomerQuestion + HelpTicket TEXT, then (by default) runs Knights
 * draft in the background. Standby may auto-approve low-risk TEXT only.
 */
export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'questions')
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
        { success: false, error: 'Invalid question payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const key = requireClientKey(parsed.data.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }

    const tenant = await enforcePerTenantSecretIfSet({
      clientKey: key.clientKey,
      req,
      sharedOk: true,
    })
    if (!tenant.ok) {
      return Response.json(
        { success: false, error: tenant.error, code: tenant.code },
        { status: tenant.status }
      )
    }

    const { question, context, locale } = parsed.data
    const intakeGate = gateFromQuestionPayload({
      gate: parsed.data.gate,
      intakeGate: parsed.data.intakeGate,
      context: context ?? null,
    })

    // Merge top-level locale into context so Knights can resolve reply language.
    const mergedContext: Record<string, unknown> = {
      ...(context ?? {}),
    }
    if (locale?.trim()) {
      mergedContext.locale = locale.trim()
    } else if (
      typeof mergedContext.locale !== 'string' &&
      typeof mergedContext.uiLocale === 'string'
    ) {
      mergedContext.locale = mergedContext.uiLocale
    }
    const contextForStore =
      Object.keys(mergedContext).length > 0 ? mergedContext : undefined

    const client = await upsertSupportClientByKey(key.clientKey)
    const created = await db.customerQuestion.create({
      data: {
        clientKey: key.clientKey,
        clientId: client.id,
        question,
        intakeGate: intakeGate ?? undefined,
        context: contextForStore as Prisma.InputJsonValue | undefined,
        actor: 'computer_agent',
      },
    })
    await audit('computer_agent', 'support.question.receive', created.id, {
      intakeGate,
      locale: typeof mergedContext.locale === 'string' ? mergedContext.locale : undefined,
    })

    const gateMeta = intakeGate ? INTAKE_GATE_META[intakeGate] : null
    const autoKnights =
      shouldAutoKnightsOnQuestion() && (gateMeta?.autoKnightsOk ?? true)

    void processInboundQuestion(created.id)
      .then((r) => {
        if (!autoKnights) return
        console.info(
          `[relay/questions] processed ${created.id} → ticket ${r.ticketId} knights=${r.knightsRan} auto=${r.autoApproved} gate=${intakeGate ?? 'unset'}`
        )
      })
      .catch((err) => {
        console.error('[relay/questions] processInboundQuestion failed', err)
        void raiseAlert({
          kind: 'question',
          severity: 'CRITICAL',
          title: 'Inbound question processing failed',
          body: question.slice(0, 140),
          entityRef: created.id,
          url: '/help-desk',
        })
      })

    const alertTitle =
      intakeGate === 'BUILD'
        ? 'New BUILD request — paid path'
        : intakeGate === 'BILLING'
          ? 'New BILLING question'
          : autoKnights
            ? 'New customer question — Knights drafting'
            : 'New customer question'

    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: alertTitle,
      body: `${gateMeta ? `${gateMeta.shape} ${gateMeta.label}: ` : ''}${question.slice(0, 120)}`,
      entityRef: created.id,
      url: '/support/inbox',
    })

    const standby = await getStandbyConfig()
    const autoSendUnlockedUntil =
      standby.autoSendActive &&
      (intakeGate === 'TECH' || intakeGate === 'OTHER' || intakeGate == null)
        ? standby.helpDeskAutoSendUntil
        : null

    /** Pilot-facing expectation — dual control unless timed unlock is active. */
    let waitingHint: string
    if (intakeGate === 'BUILD') {
      waitingHint = 'queued for paid build / quote — no auto-reply for this category'
    } else if (intakeGate === 'BILLING') {
      waitingHint = 'queued for billing — no auto-reply for this category'
    } else if (autoSendUnlockedUntil) {
      waitingHint = `Aurion auto-reply unlocked until ${autoSendUnlockedUntil}`
    } else if (autoKnights) {
      waitingHint = 'waiting for Aurion approval'
    } else {
      waitingHint = 'queued for Aurion — no auto-draft right now'
    }

    return Response.json(
      {
        success: true,
        data: {
          id: created.id,
          autoKnights,
          intakeGate,
          routeHint: gateMeta?.routeHint ?? null,
          waitingHint,
          autoSendUnlockedUntil,
        },
      } satisfies APIResponse<{
        id: string
        autoKnights: boolean
        intakeGate: string | null
        routeHint: string | null
        waitingHint: string
        autoSendUnlockedUntil: string | null
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Question submit failed',
        code: 'QUESTION_FAILED',
      },
      { status: 500 }
    )
  }
}
