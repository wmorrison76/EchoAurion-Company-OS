import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('@/lib/render-ops', () => ({
  RenderOpsError: class RenderOpsError extends Error {
    code = 'TEST_RENDER_ERROR'
    status = 400
  },
  applySuggestedEchoAiUrl: vi.fn(),
  isRenderApiConfigured: vi.fn(() => true),
  listRenderOpsServices: vi.fn(),
  resolveRenderServiceId: vi.fn(),
  triggerRenderDeploy: vi.fn(),
  upsertRenderEnvVars: vi.fn(),
}))
vi.mock('@/lib/cron-secret-rotation', () => ({
  gateCronSecretRotation: vi.fn(() => ({ allowed: false, reason: 'Test denied', code: 'DENIED' })),
  rotateCronSecretEverywhere: vi.fn(),
}))

import { auth } from '@/lib/auth'
import {
  applySuggestedEchoAiUrl,
  isRenderApiConfigured,
  listRenderOpsServices,
  resolveRenderServiceId,
  triggerRenderDeploy,
  upsertRenderEnvVars,
} from '@/lib/render-ops'
import { rotateCronSecretEverywhere } from '@/lib/cron-secret-rotation'
import { GET, POST } from './route'

const admin = { user: { id: 'operator-1', role: 'dr_os' } }
function req(method: 'GET' | 'POST', body?: Record<string, unknown>, cron = false): Request {
  const headers = new Headers()
  if (cron) headers.set('Authorization', 'Bearer scheduler-test-credential')
  if (body) headers.set('Content-Type', 'application/json')
  return new Request('https://company-os.invalid/api/dr-os/render-config', {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue(null)
  vi.mocked(isRenderApiConfigured).mockReturnValue(true)
  vi.mocked(listRenderOpsServices).mockResolvedValue([])
  vi.mocked(resolveRenderServiceId).mockResolvedValue({
    id: 'srv-test-001', name: 'isolated-test-service',
  })
  vi.mocked(upsertRenderEnvVars).mockResolvedValue(['ECHO_AI_URL'])
  vi.mocked(triggerRenderDeploy).mockResolvedValue(null)
})

describe('DrOS Render admin authorization (no live Render calls)', () => {
  it('does not let cron bearer alone GET infrastructure inventory', async () => {
    const res = await GET(req('GET', undefined, true))
    expect(res.status).toBe(401)
    expect(isRenderApiConfigured).not.toHaveBeenCalled()
    expect(listRenderOpsServices).not.toHaveBeenCalled()
  })

  it('does not let cron bearer alone change environment variables or trigger deploy', async () => {
    const res = await POST(req('POST', {
      env: { GITHUB_TOKEN: 'not-a-real-secret' }, redeploy: true,
    }, true))
    expect(res.status).toBe(401)
    expect(upsertRenderEnvVars).not.toHaveBeenCalled()
    expect(triggerRenderDeploy).not.toHaveBeenCalled()
    expect(rotateCronSecretEverywhere).not.toHaveBeenCalled()
  })

  it('does not let cron bearer rotate even the scheduler credential', async () => {
    const res = await POST(req('POST', {
      env: { CRON_SECRET: 'synthetic-token' },
      confirmRotateCronSecret: true,
      approvedBy: 'forged-operator',
    }, true))
    expect(res.status).toBe(401)
    expect(rotateCronSecretEverywhere).not.toHaveBeenCalled()
  })

  it('rejects a logged-in session without dr_os administrator role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'guest', role: 'viewer' } } as never)
    const res = await POST(req('POST', { env: { ECHO_AI_URL: 'https://example.invalid' } }))
    expect(res.status).toBe(401)
    expect(resolveRenderServiceId).not.toHaveBeenCalled()
  })

  it('admin dr_os role may use existing read-only service listing', async () => {
    vi.mocked(auth).mockResolvedValue(admin as never)
    vi.mocked(listRenderOpsServices).mockResolvedValue([{
      id: 'srv-001', name: 'demo', type: 'web', region: null, suspended: false,
    }] as never)
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.services).toHaveLength(1)
    expect(listRenderOpsServices).toHaveBeenCalledOnce()
  })

  it('admin dr_os role retains existing manual Render configuration path', async () => {
    vi.mocked(auth).mockResolvedValue(admin as never)
    const res = await POST(req('POST', {
      env: { ECHO_AI_URL: 'https://example.invalid' }, redeploy: false,
    }))
    expect(res.status).toBe(200)
    expect(resolveRenderServiceId).toHaveBeenCalledOnce()
    expect(upsertRenderEnvVars).toHaveBeenCalledOnce()
    expect(triggerRenderDeploy).not.toHaveBeenCalled()
    expect(applySuggestedEchoAiUrl).not.toHaveBeenCalled()
  })

  it('cron bearer plus insufficient viewer role remains unauthorized', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'guest', role: 'viewer' } } as never)
    const res = await POST(req('POST', { apply: 'echo_ai_url' }, true))
    expect(res.status).toBe(401)
    expect(applySuggestedEchoAiUrl).not.toHaveBeenCalled()
  })
})
