import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('@/lib/verify-bearer', () => ({ verifyCronBearer: vi.fn() }))
vi.mock('@/lib/help-desk-approve', () => ({ approveAllAwaitingApproval: vi.fn() }))

import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { verifyCronBearer } from '@/lib/verify-bearer'
import { approveAllAwaitingApproval } from '@/lib/help-desk-approve'
import { POST } from './route'

function request(dryRun: boolean, bearer = false) {
  return new Request('https://company-os.invalid/api/ops/approve-all-awaiting' +
    (dryRun ? '?dryRun=1' : ''), {
    method: 'POST',
    headers: bearer ? { Authorization: 'Bearer test-cron-secret' } : undefined,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue(null as never)
  vi.mocked(verifyCronBearer).mockReturnValue(false)
  vi.mocked(approveAllAwaitingApproval).mockResolvedValue({
    approved: 0, skipped: 0, failed: 0, results: [],
  })
  vi.mocked(audit).mockResolvedValue(undefined)
})

describe('bulk Help Desk approval identity gate', () => {
  it('rejects anonymous callers without side effects', async () => {
    const res = await POST(request(false))
    expect(res.status).toBe(401)
    expect(approveAllAwaitingApproval).not.toHaveBeenCalled()
  })

  it('prevents cron bearer token from sending bulk replies', async () => {
    vi.mocked(verifyCronBearer).mockReturnValue(true)
    const res = await POST(request(false, true))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('ADMIN_APPROVAL_REQUIRED')
    expect(approveAllAwaitingApproval).not.toHaveBeenCalled()
  })

  it('lets scheduler inspect ONLY a non-mutating dry-run', async () => {
    vi.mocked(verifyCronBearer).mockReturnValue(true)
    const res = await POST(request(true, true))
    expect(res.status).toBe(200)
    expect(approveAllAwaitingApproval).toHaveBeenCalledWith({
      actor: 'computer_agent', dryRun: true,
    })
  })

  it('rejects nonadmin logged-in session for actual approvals', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'viewer', role: 'viewer' } } as never)
    const res = await POST(request(false))
    expect(res.status).toBe(401)
    expect(approveAllAwaitingApproval).not.toHaveBeenCalled()
  })

  it('permits admin session to approve or send subject to downstream safety gates', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin', role: 'dr_os' } } as never)
    const res = await POST(request(false))
    expect(res.status).toBe(200)
    expect(approveAllAwaitingApproval).toHaveBeenCalledWith({
      actor: 'william_morrison', dryRun: false,
    })
    expect(audit).toHaveBeenCalled()
  })

  it('permits admin to preview without sending', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin', role: 'dr_os' } } as never)
    const res = await POST(request(true))
    expect(res.status).toBe(200)
    expect(approveAllAwaitingApproval).toHaveBeenCalledWith({
      actor: 'william_morrison', dryRun: true,
    })
  })
})
