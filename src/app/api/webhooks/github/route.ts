import { createHmac, timingSafeEqual } from 'crypto'
import { audit } from '@/lib/audit'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { verifyRequestHandshake } from '@/lib/request-handshake'
import {
  ingestBugbotAutofixComment,
  ingestCheckSuiteFailure,
  ingestPullRequestFailure,
  ingestWorkflowRunFailure,
} from '@/lib/ops-failure-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/webhooks/github
 * GitHub Actions / Checks / PR failure + Bugbot/cursor autofix comments
 * → HelpTicket SYSTEM + agent queue (failures) / timeline (autofix applied).
 *
 * Setup (GitHub → Settings → Webhooks) on Company OS + product repos:
 *   Payload URL: https://<company-os>/api/webhooks/github
 *   Content type: application/json
 *   Secret: GITHUB_WEBHOOK_SECRET (same value in Render env)
 *   Events: Workflow runs, Check suites, Pull requests, Issue comments,
 *           Pull request review comments
 *
 * Auth: X-Hub-Signature-256 (HMAC SHA-256 of raw body).
 * Middleware: excluded (public + signature verify).
 */

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signatureHeader.slice('sha256='.length)
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(received, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  const throttle = allowIngestThrottle({ scope: 'github_webhook' })
  if (!throttle.ok) return throttleResponse(throttle)

  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return Response.json(
      {
        success: false,
        error: 'GITHUB_WEBHOOK_SECRET not configured',
        code: 'WEBHOOK_DISABLED',
        label: '? Webhook disabled — set GITHUB_WEBHOOK_SECRET',
      },
      { status: 503 }
    )
  }

  const rawBody = await req.text()
  const sig = req.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, sig, secret)) {
    return Response.json(
      { success: false, error: 'Invalid signature', code: '401', label: '✕ Invalid signature' },
      { status: 401 }
    )
  }

  const deliveryId = req.headers.get('x-github-delivery')
  const hs = await verifyRequestHandshake({
    req,
    route: 'webhooks.github',
    deliveryId,
    required: Boolean(deliveryId),
    rawBody,
  })
  if (!hs.ok) {
    // Replay of same delivery — ack 202 without re-ingest
    if (hs.code === 'REPLAY_REJECTED') {
      return Response.json(
        {
          success: true,
          data: { event: 'replay', ingested: false, label: '○ Replay ignored' },
        },
        { status: 202 }
      )
    }
    return Response.json(
      { success: false, error: hs.error, code: hs.code, label: '✕ Handshake failed' },
      { status: hs.status }
    )
  }

  const event = req.headers.get('x-github-event') ?? 'unknown'
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return Response.json({ received: true, ignored: 'bad_json' })
  }

  try {
    let result: { ingested: boolean; ticketId?: string; reason?: string } = {
      ingested: false,
      reason: 'unhandled_event',
    }

    if (event === 'workflow_run') {
      result = await ingestWorkflowRunFailure(
        payload as Parameters<typeof ingestWorkflowRunFailure>[0]
      )
    } else if (event === 'check_suite') {
      result = await ingestCheckSuiteFailure(
        payload as Parameters<typeof ingestCheckSuiteFailure>[0]
      )
    } else if (event === 'pull_request') {
      result = await ingestPullRequestFailure(
        payload as Parameters<typeof ingestPullRequestFailure>[0]
      )
    } else if (event === 'issue_comment' || event === 'pull_request_review_comment') {
      result = await ingestBugbotAutofixComment(
        payload as Parameters<typeof ingestBugbotAutofixComment>[0]
      )
    }

    await audit('computer_agent', 'github.webhook', result.ticketId, {
      event,
      ingested: result.ingested,
      reason: result.reason ?? null,
    }).catch(() => {})

    const label = result.ingested
      ? event.includes('comment')
        ? '✓ Bugbot/autofix captured'
        : '✓ CI failure captured'
      : '○ Event acknowledged'

    // Always 202 — GitHub retries on 5xx; we ack after durable ingest attempt.
    return Response.json(
      {
        success: true,
        data: {
          event,
          ingested: result.ingested,
          ticketId: result.ticketId ?? null,
          reason: result.reason ?? null,
          label,
        },
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('[github.webhook]', error)
    // Still ack to avoid retry storms; ops poll is the backup.
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'webhook_failed',
        label: '⚠ Webhook error — poll backup',
      },
      { status: 202 }
    )
  }
}
