'use client'

import { useState } from 'react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { computeQuote, formatUSD } from '@/lib/pricing'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export interface TestScenarioState {
  ticketId: string
  workRequestId: string
  clientKey: string
  billingToken: string
  rollbackRef: string
}

type StepKey = 'knights' | 'quote' | 'free' | 'authorize' | 'execute'

interface Props {
  scenario: TestScenarioState
  onRefresh: () => Promise<void>
  busy: string | null
}

/**
 * Guided checklist after seeding a simulated customer change request.
 * Steps call existing Help Desk / Work APIs (plus test authorize helper).
 */
export function TestScenarioChecklist({
  scenario,
  onRefresh,
  busy,
}: Props) {
  const [done, setDone] = useState<Partial<Record<StepKey, boolean>>>({})
  const [localBusy, setLocalBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const t2Preview = computeQuote('T2')
  const active = busy || localBusy

  async function run(label: string, fn: () => Promise<void>) {
    setLocalBusy(label)
    setErr(null)
    setNote(null)
    try {
      await fn()
      await onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Step failed')
    } finally {
      setLocalBusy(null)
    }
  }

  async function approveFree() {
    await run('free', async () => {
      // Help Desk thread first, then Work API so status ends AUTHORIZED (Execute-ready).
      // Help Desk alone would leave work IN_PROGRESS and block Execute.
      const approveRes = await fetch(`/api/help-desk/tickets/${scenario.ticketId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'approve_free' }),
      })
      const approveBody = (await approveRes.json()) as APIResponse<HelpTicketDetail>
      if (!approveBody.success) throw new Error(approveBody.error)

      const workRes = await fetch(`/api/work/${scenario.workRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_free',
          reason: 'Test scenario complimentary gift',
        }),
      })
      const workBody = (await workRes.json()) as APIResponse<{ id: string }>
      if (!workBody.success) throw new Error(workBody.error)

      setDone((d) => ({ ...d, free: true }))
      setNote('Approved free · work AUTHORIZED — skip step 4, go to Execute')
    })
  }

  async function sendQuoteT2() {
    await run('quote', async () => {
      const quoteRes = await fetch(`/api/work/${scenario.workRequestId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'T2' }),
      })
      const quoteBody = (await quoteRes.json()) as APIResponse<{ total: number; tier: string }>
      if (!quoteBody.success) throw new Error(quoteBody.error)

      const approveRes = await fetch(`/api/help-desk/tickets/${scenario.ticketId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'send_quote',
          answer: `T2 quote sent: ${formatUSD(quoteBody.data.total)}. Awaiting billing contact authorization.`,
        }),
      })
      const approveBody = (await approveRes.json()) as APIResponse<HelpTicketDetail>
      if (!approveBody.success) throw new Error(approveBody.error)

      setDone((d) => ({ ...d, quote: true }))
      setNote(`Quoted T2 · ${formatUSD(quoteBody.data.total)}`)
    })
  }

  async function simulateAuthorize() {
    await run('authorize', async () => {
      const res = await fetch('/api/help-desk/test-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'authorize',
          workRequestId: scenario.workRequestId,
        }),
      })
      const body = (await res.json()) as APIResponse<{
        status: string
        customerApprover: string
      }>
      if (!body.success) throw new Error(body.error)
      setDone((d) => ({ ...d, authorize: true }))
      setNote(`Authorized by ${body.data.customerApprover}`)
    })
  }

  async function execute() {
    await run('execute', async () => {
      const res = await fetch(`/api/work/${scenario.workRequestId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollbackRef: scenario.rollbackRef }),
      })
      const body = (await res.json()) as APIResponse<{ id: string }>
      if (!body.success) throw new Error(body.error)
      setDone((d) => ({ ...d, execute: true }))
      setNote(`Executed · rollback ${scenario.rollbackRef}`)
    })
  }

  return (
    <div
      className="rounded-xl border border-[#D4AF37]/40 bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Test scenario checklist"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge level="warn" label="Test scenario" />
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
          Customer change request checklist
        </p>
      </div>
      <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
        {scenario.clientKey} · work {scenario.workRequestId.slice(0, 8)}… · rollback{' '}
        {scenario.rollbackRef}
      </p>

      <ol className="mt-3 flex flex-col gap-2">
        <li className="flex flex-wrap items-center gap-2">
          <StepMark done={!!done.knights} n={1} />
          <span className="text-xs text-[#a0a0b8]">Ask Knights</span>
          <button
            type="button"
            disabled={!!active}
            onClick={() =>
              void run('knights', async () => {
                const res = await fetch(
                  `/api/help-desk/tickets/${scenario.ticketId}/knights`,
                  { method: 'POST' }
                )
                const body = (await res.json()) as APIResponse<HelpTicketDetail>
                if (!body.success) throw new Error(body.error)
                setDone((d) => ({ ...d, knights: true }))
                setNote('Knights draft posted — review in the thread')
              })
            }
            className="rounded-lg border border-[#D4AF37] px-2.5 py-1 text-[11px] text-[#D4AF37] disabled:opacity-40"
            aria-label="Checklist step Ask Knights"
          >
            {localBusy === 'knights' ? '…' : 'Run'}
          </button>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <StepMark done={!!done.knights} n={2} />
          <span className="text-xs text-[#a0a0b8]">Review draft in the thread (no button)</span>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <StepMark done={!!(done.quote || done.free)} n={3} />
          <span className="text-xs text-[#a0a0b8]">
            Approve free OR Send quote (T2 · {formatUSD(t2Preview.total)})
          </span>
          <button
            type="button"
            disabled={!!active}
            onClick={() => void approveFree()}
            className="rounded-lg border border-[#22c55e] px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
            aria-label="Checklist Approve free"
          >
            {localBusy === 'free' ? '…' : 'Approve free'}
          </button>
          <button
            type="button"
            disabled={!!active}
            onClick={() => void sendQuoteT2()}
            className="rounded-lg border border-[#f59e0b] px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
            aria-label="Checklist Send quote T2"
          >
            {localBusy === 'quote' ? '…' : 'Send quote T2'}
          </button>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <StepMark done={!!done.authorize} n={4} />
          <span className="text-xs text-[#a0a0b8]">If quoted — simulate billing authorize</span>
          <button
            type="button"
            disabled={!!active}
            onClick={() => void simulateAuthorize()}
            className="rounded-lg border border-[#2a2a3f] px-2.5 py-1 text-[11px] text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-40"
            aria-label="Simulate billing contact authorize"
          >
            {localBusy === 'authorize' ? '…' : 'Simulate authorize'}
          </button>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <StepMark done={!!done.execute} n={5} />
          <span className="text-xs text-[#a0a0b8]">
            Execute with rollback <span className="font-mono">{scenario.rollbackRef}</span>
          </span>
          <button
            type="button"
            disabled={!!active}
            onClick={() => void execute()}
            className="rounded-lg border border-[#22c55e] px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
            aria-label="Execute with test rollback reference"
          >
            {localBusy === 'execute' ? '…' : 'Execute'}
          </button>
        </li>
      </ol>

      {note && (
        <p className="mt-2 text-[11px] text-[#a0a0b8]">
          <span aria-label="Healthy">✓</span> {note}
        </p>
      )}
      {err && (
        <p className="mt-2 text-[11px] text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {err}
        </p>
      )}
      <p className="mt-2 text-[10px] text-[#5a5a78]">
        Docs: <span className="font-mono">docs/CUSTOMER_CHANGE_REQUEST_FLOW.md</span>
      </p>
    </div>
  )
}

function StepMark({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#22c55e] font-mono text-[10px] text-white"
      aria-label={`Step ${n} done`}
    >
      ✓
    </span>
  ) : (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#2a2a3f] font-mono text-[10px] text-[#5a5a78]"
      aria-label={`Step ${n} pending`}
    >
      {n}
    </span>
  )
}
