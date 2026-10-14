import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    customerQuestion: { findMany: vi.fn() },
    helpTicket: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/relay-history-tenant-auth', () => ({
  authorizeRelayHistoryRead: vi.fn(),
}))
vi.mock('@/lib/relay-auth', () => ({
  relayAuthorized: vi.fn(),
  relayQuestionsThrottle: vi.fn(),
  relayRateLimited: vi.fn(),
  relayThrottleResponse: vi.fn(),
  requireClientKey: (value: string | null) => value
    ? { ok: true, clientKey: value } : {
      ok: false, status: 400, code: 'CLIENT_KEY_REQUIRED', error: 'clientKey is required',
    },
}))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('@/lib/alerts', () => ({ raiseAlert: vi.fn() }))
vi.mock('@/lib/relay-heartbeat', () => ({ upsertSupportClientByKey: vi.fn() }))
vi.mock('@/lib/help-desk-knights', () => ({
  processInboundQuestion: vi.fn(), shouldAutoKnightsOnQuestion: vi.fn(),
}))
vi.mock('@/lib/standby', () => ({ getStandbyConfig: vi.fn() }))
vi.mock('@/lib/intake-gate', () => ({
  gateFromQuestionPayload: vi.fn(), INTAKE_GATE_META: {},
}))
vi.mock('@/lib/support-eta', () => ({ supportEtaLabel: vi.fn() }))
vi.mock('@/lib/tenant-ingest-secret', () => ({ enforcePerTenantSecretIfSet: vi.fn() }))
vi.mock('@/lib/help-desk-attachments', () => ({
  attachmentAuditMeta: vi.fn(), parseIncomingAttachments: vi.fn(), persistAttachments: vi.fn(),
}))
vi.mock('@/lib/relay-question-scope', () => ({
  parseRelayUserId: (userId: string | null) => userId || null,
  userIdContextEquals: (userId: string) => ({ path: ['userId'], equals: userId }),
}))
vi.mock('@/lib/echo-guardrails', () => ({
  allowEchoTicketBudget: vi.fn(), echoFileWhy: vi.fn(),
  enforceEchoClientKey: vi.fn(), isEchoPanelWatchEnabled: vi.fn(),
}))
vi.mock('@/lib/echo-ticket-priority', () => ({ isEchoAiContext: vi.fn() }))
vi.mock('@/lib/customer-thread-meta', () => ({ buildCustomerThreadMeta: vi.fn() }))
vi.mock('@/lib/relay-question-followup', () => ({ processRelayFollowUp: vi.fn() }))

import { db } from '@/lib/db'
import { authorizeRelayHistoryRead } from '@/lib/relay-history-tenant-auth'
import { relayAuthorized, relayRateLimited } from '@/lib/relay-auth'
import { GET } from './route'

const auth = vi.mocked(authorizeRelayHistoryRead)
const questionRead = vi.mocked(db.customerQuestion.findMany)
const ticketRead = vi.mocked(db.helpTicket.findMany)
const rate = vi.mocked(relayRateLimited)

function req(clientKey = 'property-alpha', userId = 'user1'): Request {
  return new Request(
    'https://company-os.invalid/api/relay/questions?clientKey=' +
    encodeURIComponent(clientKey) + '&userId=' + encodeURIComponent(userId),
    { headers: { Authorization: 'Bearer only-a-shared-secret-for-this-test' } },
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  auth.mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized installation', code: 'INSTALLATION_CREDENTIAL_REQUIRED' })
  rate.mockReturnValue({ ok: true })
  questionRead.mockResolvedValue([])
  ticketRead.mockResolvedValue([])
})

describe('Help Desk GET route tenant authorization wiring', () => {
  it('denies a bearer validated only as fleet-wide before querying customer rows', async () => {
    vi.mocked(relayAuthorized).mockReturnValue({ ok: true })
    const result = await GET(req())
    expect(result.status).toBe(401)
    expect(auth).toHaveBeenCalledWith({ req: expect.any(Request), clientKey: 'property-alpha' })
    expect(questionRead).not.toHaveBeenCalled()
    expect(ticketRead).not.toHaveBeenCalled()
    expect(relayAuthorized).not.toHaveBeenCalled()
  })

  it('does not grant data access when the installation authentication store is down', async () => {
    auth.mockResolvedValueOnce({ ok: false, status: 503, error: 'Authorization unavailable', code: 'INSTALLATION_AUTH_UNAVAILABLE' })
    const result = await GET(req())
    expect(result.status).toBe(503)
    expect(questionRead).not.toHaveBeenCalled()
  })

  it('queries only after registered installation authorization, preserving tenant and user filter', async () => {
    auth.mockResolvedValueOnce({ ok: true, clientKey: 'property-alpha' })
    const result = await GET(req())
    expect(result.status).toBe(200)
    expect(questionRead).toHaveBeenCalledOnce()
    expect(questionRead.mock.calls[0][0]?.where).toMatchObject({
      clientKey: 'property-alpha',
      context: { path: ['userId'], equals: 'user1' },
    })
    expect(ticketRead).toHaveBeenCalledOnce()
    expect(ticketRead.mock.calls[0][0]?.where).toMatchObject({
      clientKey: 'property-alpha',
      customerQuestionId: { in: [] },
    })
  })

  it('throttles even a valid installation before touching private data', async () => {
    auth.mockResolvedValueOnce({ ok: true, clientKey: 'property-alpha' })
    rate.mockReturnValueOnce({ ok: false, status: 429, error: 'rate limited', code: 'RATE_LIMITED' })
    const result = await GET(req())
    expect(result.status).toBe(429)
    expect(questionRead).not.toHaveBeenCalled()
  })

  it('rejects throttled requests before querying installation credentials', async () => {
    rate.mockReturnValueOnce({ ok: false, status: 429, error: 'rate limited', code: 'RATE_LIMITED' })
    const result = await GET(req())
    expect(result.status).toBe(429)
    expect(auth).not.toHaveBeenCalled()
    expect(questionRead).not.toHaveBeenCalled()
  })

  it('does not disclose internal history query exceptions', async () => {
    auth.mockResolvedValueOnce({ ok: true, clientKey: 'property-alpha' })
    questionRead.mockRejectedValueOnce(new Error('private database connection details'))
    const result = await GET(req())
    expect(result.status).toBe(500)
    const body = await result.json()
    expect(body.code).toBe('HISTORY_FAILED')
    expect(JSON.stringify(body)).not.toContain('private database connection details')
  })

  it('does not retrieve org-wide history if caller omits a userId', async () => {
    auth.mockResolvedValueOnce({ ok: true, clientKey: 'property-alpha' })
    const result = await GET(req('property-alpha', ''))
    expect(result.status).toBe(200)
    expect(questionRead).not.toHaveBeenCalled()
  })
})
