'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fixDispositionBadge } from '@/lib/fix-disposition'
import { PolicyRecommendationBanner } from '@/components/support/PolicyRecommendation'
import { PricingReferenceCard } from '@/components/help-desk/PricingReferenceCard'
import {
  TestScenarioChecklist,
  type TestScenarioState,
} from '@/components/help-desk/TestScenarioChecklist'
import { ClientAssistPanel } from '@/components/help-desk/ClientAssistPanel'
import { ToolbeltPanel } from '@/components/help-desk/ToolbeltPanel'
import { TicketTimeline } from '@/components/help-desk/TicketTimeline'
import { DeadLetterOpsPanel } from '@/components/help-desk/DeadLetterOpsPanel'
import { CohortMessagingPanel } from '@/components/help-desk/CohortMessagingPanel'
import { KnightsWatchingChip } from '@/components/help-desk/KnightsWatchingChip'
import { LabInstallLinks } from '@/components/layout/LabInstallLinks'
import { classifySupportRequest, type PolicyVerdict } from '@/lib/support-policy'
import { clearFormDraft, useFormDraft, useUnsavedChangesGuard } from '@/lib/use-form-draft'
import type { APIResponse } from '@/types'
import type {
  HelpTicketDetail,
  HelpTicketListItem,
  HelpVoiceNoteSource,
  IntakeGate,
} from '@/types/help-desk'

type FilterKey = 'open' | 'voice' | 'feature' | 'awaiting' | 'breached' | 'all'

interface MacroChip {
  id: string
  label: string
  body: string
  source: 'builtin' | 'article'
}

const GATE_BADGE: Record<
  IntakeGate,
  { level: 'ok' | 'warn' | 'error' | 'unknown'; label: string }
> = {
  TECH: { level: 'ok', label: '◆ Tech' },
  BILLING: { level: 'warn', label: '● Billing' },
  BUILD: { level: 'error', label: '■ Build' },
  OTHER: { level: 'unknown', label: '○ Other' },
}

/** ISO → value for `<input type="datetime-local">` in the browser's local zone. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function ago(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

function statusLevel(
  status: string
): 'ok' | 'warn' | 'error' | 'unknown' {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'ok'
  if (status === 'AWAITING_APPROVAL' || status === 'WITH_KNIGHTS') return 'warn'
  if (status === 'WAITING') return 'unknown'
  return 'unknown'
}

function channelLevel(channel: string): 'ok' | 'warn' | 'error' | 'unknown' {
  if (channel === 'VOICE') return 'warn'
  if (channel === 'FEATURE') return 'error'
  if (channel === 'SYSTEM') return 'unknown'
  return 'ok'
}

function roleLabel(role: string, seat: string | null): string {
  if (role === 'KNIGHT') return seat ? `Knight · ${seat}` : 'Knight'
  if (role === 'ADMIN') return 'William'
  if (role === 'CUSTOMER') return 'Requester'
  return 'System'
}

export function HelpDeskConsole() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<FilterKey>('open')
  const [gateFilter, setGateFilter] = useState<IntakeGate | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('ticket')
  )
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showVoice, setShowVoice] = useState(false)
  const [showFeature, setShowFeature] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [scenario, setScenario] = useState<TestScenarioState | null>(null)
  const [csatScore, setCsatScore] = useState<number | null>(null)
  const [closeReason, setCloseReason] = useState('resolved_howto')
  const [, startTransition] = useTransition()

  const listKey = `/api/help-desk/tickets?filter=${filter}${
    gateFilter !== 'ALL' ? `&gate=${gateFilter}` : ''
  }`
  const { data: tickets, error: listError, mutate: mutateList, isLoading } = useSWR(
    listKey,
    jsonFetcher<HelpTicketListItem[]>,
    { refreshInterval: 20_000, dedupingInterval: 10_000, revalidateOnFocus: false }
  )
  const { data: macros } = useSWR('/api/help-desk/macros', jsonFetcher<MacroChip[]>, {
    revalidateOnFocus: false,
  })

  const { data: standby, mutate: mutateStandby } = useSWR(
    '/api/support/standby',
    jsonFetcher<{
      mode: string
      maxAutoPerHour: number
      helpDeskAutoSendEnabled: boolean
      helpDeskAutoSendUntil: string | null
      autoSendActive: boolean
    }>,
    { refreshInterval: 30_000, dedupingInterval: 15_000, revalidateOnFocus: false }
  )

  const [permitUntilLocal, setPermitUntilLocal] = useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString())
  )
  const [permitBusy, setPermitBusy] = useState(false)
  const [permitError, setPermitError] = useState<string | null>(null)

  // Sync picker when server has an active window (e.g. after refresh / extend elsewhere).
  useEffect(() => {
    if (standby?.autoSendActive && standby.helpDeskAutoSendUntil) {
      setPermitUntilLocal(toDatetimeLocalValue(standby.helpDeskAutoSendUntil))
    }
  }, [standby?.autoSendActive, standby?.helpDeskAutoSendUntil])

  const unlockAutoSend = useCallback(async () => {
    setPermitBusy(true)
    setPermitError(null)
    try {
      const until = new Date(permitUntilLocal)
      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        throw new Error('Pick a day and time in the future')
      }
      const res = await fetch('/api/support/standby', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          helpDeskAutoSendEnabled: true,
          helpDeskAutoSendUntil: until.toISOString(),
        }),
      })
      const body = (await res.json()) as APIResponse<unknown>
      if (!body.success) throw new Error(body.error)
      await mutateStandby()
    } catch (e) {
      setPermitError(e instanceof Error ? e.message : 'Failed to unlock auto-send')
    } finally {
      setPermitBusy(false)
    }
  }, [permitUntilLocal, mutateStandby])

  const lockAutoSend = useCallback(async () => {
    setPermitBusy(true)
    setPermitError(null)
    try {
      const res = await fetch('/api/support/standby', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpDeskAutoSendEnabled: false }),
      })
      const body = (await res.json()) as APIResponse<unknown>
      if (!body.success) throw new Error(body.error)
      await mutateStandby()
    } catch (e) {
      setPermitError(e instanceof Error ? e.message : 'Failed to lock auto-send')
    } finally {
      setPermitBusy(false)
    }
  }, [mutateStandby])

  const {
    data: detail,
    error: detailError,
    mutate: mutateDetail,
    isLoading: detailLoading,
  } = useSWR(
    selectedId ? `/api/help-desk/tickets/${selectedId}` : null,
    jsonFetcher<HelpTicketDetail>,
    { refreshInterval: 15_000, dedupingInterval: 7_500 }
  )

  // Deep-link: ?import=question:id or work:id
  useEffect(() => {
    const imp = searchParams.get('import')
    if (!imp) return
    const [kind, id] = imp.split(':')
    if ((kind !== 'question' && kind !== 'work') || !id) return

    let cancelled = false
    ;(async () => {
      setBusy('import')
      setError(null)
      try {
        const res = await fetch('/api/help-desk/from-inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, id }),
        })
        const body = (await res.json()) as APIResponse<HelpTicketDetail>
        if (!body.success) throw new Error(body.error)
        if (cancelled) return
        setSelectedId(body.data.id)
        await mutateList()
        router.replace(`/help-desk?ticket=${body.data.id}`)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Import failed')
      } finally {
        if (!cancelled) setBusy(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, mutateList, router])

  // Sync ticket query param
  useEffect(() => {
    const t = searchParams.get('ticket')
    if (t && t !== selectedId) setSelectedId(t)
  }, [searchParams, selectedId])

  const selectTicket = useCallback(
    (id: string) => {
      setSelectedId(id)
      setReply('')
      setError(null)
      startTransition(() => {
        router.replace(`/help-desk?ticket=${id}`)
      })
    },
    [router]
  )

  const refresh = useCallback(async () => {
    await Promise.all([mutateList(), mutateDetail()])
  }, [mutateList, mutateDetail])

  async function approveAllAwaiting() {
    setBusy('approve-all')
    setError(null)
    try {
      const res = await fetch('/api/ops/approve-all-awaiting', { method: 'POST' })
      const body = (await res.json()) as APIResponse<{
        approved: number
        skipped: number
        failed: number
      }>
      if (!body.success) throw new Error(body.error)
      await refresh()
      setFilter('awaiting')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve all failed')
    } finally {
      setBusy(null)
    }
  }

  async function postAction(
    label: string,
    url: string,
    payload?: unknown
  ): Promise<HelpTicketDetail | null> {
    setBusy(label)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      })
      const body = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!body.success) throw new Error(body.error)
      setSelectedId(body.data.id)
      await refresh()
      return body.data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
      return null
    } finally {
      setBusy(null)
    }
  }

  // Zero-work-loss: persist the reply draft per ticket across disconnects,
  // redeploys, and soft reloads; warn before closing with unsent typing.
  useFormDraft(`hd-reply:${selectedId ?? 'none'}`, reply, setReply)
  useUnsavedChangesGuard(Boolean(reply.trim()))

  async function sendReply() {
    if (!selectedId || !reply.trim()) return
    const ok = await postAction('reply', `/api/help-desk/tickets/${selectedId}/messages`, {
      body: reply.trim(),
      role: 'ADMIN',
    })
    if (ok) {
      setReply('')
      clearFormDraft(`hd-reply:${selectedId}`)
    }
  }

  async function askKnights() {
    if (!selectedId) return
    await postAction('knights', `/api/help-desk/tickets/${selectedId}/knights`)
  }

  async function approve(mode: 'reply' | 'approve_free' | 'send_quote') {
    if (!selectedId) return
    const payload: { mode: typeof mode; answer?: string } = { mode }
    if (mode === 'reply' && reply.trim()) payload.answer = reply.trim()
    const ok = await postAction('approve', `/api/help-desk/tickets/${selectedId}/approve`, payload)
    if (ok) {
      setReply('')
      clearFormDraft(`hd-reply:${selectedId}`)
    }
  }

  async function markResolved() {
    if (!selectedId) return
    setBusy('resolve')
    setError(null)
    try {
      const res = await fetch(`/api/help-desk/tickets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESOLVED',
          ...(csatScore != null ? { csatScore } : {}),
          closeReason,
        }),
      })
      const body = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!body.success) throw new Error(body.error)
      setCsatScore(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resolve failed')
    } finally {
      setBusy(null)
    }
  }

  async function promoteScope(scope: 'USER' | 'ACCOUNT' | 'COHORT' | 'GLOBAL') {
    if (!selectedId) return
    setBusy('promote')
    setError(null)
    try {
      const res = await fetch(`/api/help-desk/tickets/${selectedId}/promote-scope`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      })
      const body = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!body.success) throw new Error(body.error)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promote failed')
    } finally {
      setBusy(null)
    }
  }

  async function setCanaryThenFleet() {
    if (!selectedId || !detail) return
    const raw = window.prompt(
      'Canary clientKeys (comma-separated). Leave empty to clear.',
      detail.canaryClientKeys.join(', ')
    )
    if (raw === null) return
    setBusy('canary')
    setError(null)
    try {
      const keys = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(`/api/help-desk/tickets/${selectedId}/canary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', canaryClientKeys: keys }),
      })
      const body = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!body.success) throw new Error(body.error)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Canary update failed')
    } finally {
      setBusy(null)
    }
  }

  async function promoteCanaryFleet() {
    if (!selectedId) return
    setBusy('canary-fleet')
    setError(null)
    try {
      const res = await fetch(`/api/help-desk/tickets/${selectedId}/canary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote_fleet' }),
      })
      const body = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!body.success) throw new Error(body.error)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fleet promote failed')
    } finally {
      setBusy(null)
    }
  }

  async function simulateCustomerChange() {
    setBusy('test-scenario')
    setError(null)
    try {
      const res = await fetch('/api/help-desk/test-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      })
      const body = (await res.json()) as APIResponse<{
        ticket: HelpTicketDetail
        workRequestId: string
        clientKey: string
        billingToken: string
        rollbackRef: string
      }>
      if (!body.success) throw new Error(body.error)
      setScenario({
        ticketId: body.data.ticket.id,
        workRequestId: body.data.workRequestId,
        clientKey: body.data.clientKey,
        billingToken: body.data.billingToken,
        rollbackRef: body.data.rollbackRef,
      })
      setSelectedId(body.data.ticket.id)
      setFilter('feature')
      await mutateList()
      startTransition(() => {
        router.replace(`/help-desk?ticket=${body.data.ticket.id}`)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test scenario failed')
    } finally {
      setBusy(null)
    }
  }

  const policyVerdict: PolicyVerdict | null = useMemo(() => {
    if (!detail?.policy) return null
    return {
      recommendation: detail.policy.recommendation as PolicyVerdict['recommendation'],
      reason: detail.policy.reason,
      suggestedTier: detail.policy.suggestedTier as PolicyVerdict['suggestedTier'],
      shape: detail.policy.shape as PolicyVerdict['shape'],
      label: detail.policy.label,
      operatorHint: detail.policy.operatorHint,
    }
  }, [detail])

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'breached', label: '✕ Breached' },
    { key: 'voice', label: 'Voice' },
    { key: 'feature', label: 'Feature' },
    { key: 'awaiting', label: 'Awaiting approval' },
    { key: 'all', label: 'All' },
  ]

  const gateFilters: { key: IntakeGate | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'All gates' },
    { key: 'TECH', label: '◆ Tech' },
    { key: 'BILLING', label: '● Billing' },
    { key: 'BUILD', label: '■ Build' },
    { key: 'OTHER', label: '○ Other' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <LabInstallLinks />
      <KnightsWatchingChip />
      <DeadLetterOpsPanel />
      <CohortMessagingPanel />

      {/* Standby toggle — Knights may approve low-risk when William unavailable */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
            Standby: Knights may approve low-risk
          </p>
          <p className="mt-1 text-[11px] text-[#a0a0b8]">
            Mode{' '}
            <span className="font-mono text-white">{standby?.mode ?? 'off'}</span>
            {' · '}TEXT how-to only · never auto-execute work ·{' '}
            <a href="/support/pilot-links" className="text-[#D4AF37] underline">
              Pilot links
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['off', 'Off'],
              ['draft_only', 'Draft only'],
              ['auto_answer_low_risk', 'Auto low-risk'],
            ] as const
          ).map(([mode, label]) => {
            const active = (standby?.mode ?? 'off') === mode
            return (
              <button
                key={mode}
                type="button"
                aria-label={`Set standby mode to ${label}`}
                aria-pressed={active}
                onClick={() => {
                  void (async () => {
                    await fetch('/api/support/standby', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mode }),
                    })
                    await mutateStandby()
                  })()
                }}
                className={
                  active
                    ? 'rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs text-[#D4AF37]'
                    : 'rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:bg-[#22223a]'
                }
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Timed unlock — temporary dual-control permit (expiry-based, not permanent) */}
      <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
              Permit / Unlock auto-send
            </p>
            <p className="mt-1 text-[11px] text-[#a0a0b8]">
              Temporarily allow low-risk TEXT Tech/Other drafts to send after Knights — without
              leaving standby on forever. Build &amp; Billing never auto-send. Core paths stay
              draft-PR-only.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {standby?.autoSendActive ? (
                <StatusBadge
                  level="ok"
                  label={`Unlocked until ${
                    standby.helpDeskAutoSendUntil
                      ? new Date(standby.helpDeskAutoSendUntil).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : '…'
                  }${
                    standby.helpDeskAutoSendUntil
                      ? ` · ${formatDistanceToNow(new Date(standby.helpDeskAutoSendUntil), {
                          addSuffix: true,
                        })}`
                      : ''
                  }`}
                />
              ) : (
                <StatusBadge level="warn" label="Locked — approve required" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <label className="flex flex-col gap-1 text-[11px] text-[#a0a0b8]">
              <span>Expires (day + time)</span>
              <input
                type="datetime-local"
                value={permitUntilLocal}
                onChange={(e) => setPermitUntilLocal(e.target.value)}
                aria-label="Auto-send permit expiry day and time"
                className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-1.5 text-sm text-white"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={permitBusy}
                aria-label={
                  standby?.autoSendActive
                    ? 'Extend auto-send unlock until selected time'
                    : 'Unlock auto-send until selected time'
                }
                aria-pressed={Boolean(standby?.autoSendActive)}
                onClick={() => void unlockAutoSend()}
                className={
                  standby?.autoSendActive
                    ? 'rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs text-[#D4AF37] disabled:opacity-50'
                    : 'rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:bg-[#22223a] disabled:opacity-50'
                }
              >
                {permitBusy ? '…' : standby?.autoSendActive ? 'Extend until…' : '◎ Unlock until…'}
              </button>
              <button
                type="button"
                disabled={permitBusy || !standby?.autoSendActive}
                aria-label="Lock auto-send — require Approve and send"
                onClick={() => void lockAutoSend()}
                className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:bg-[#22223a] disabled:opacity-40"
              >
                ■ Lock now
              </button>
              <button
                type="button"
                disabled={busy === 'approve-all'}
                aria-label="Approve and send all tickets awaiting approval"
                onClick={() => void approveAllAwaiting()}
                className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-[#D4AF37] hover:bg-[#22223a] disabled:opacity-50"
              >
                {busy === 'approve-all' ? 'Approving…' : '✓ Approve all awaiting'}
              </button>
            </div>
          </div>
        </div>
        {permitError && (
          <p className="mt-2 flex items-center gap-2 text-xs text-[#a0a0b8]" role="alert">
            <span aria-label="Error">✕</span>
            <span>{permitError}</span>
          </p>
        )}
      </div>

      {/* Operator guide */}
      <div className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Operator guide</p>
        <p className="mt-1 text-sm text-[#a0a0b8]">
          Help Desk is your live ticket workspace — text, voice dictation, Ask Knights, custom
          builds. Board Room is strategy counsel; Support is client health; Inbox is triage.
        </p>
        <details className="mt-3 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3">
          <summary className="cursor-pointer text-xs font-medium text-white">
            What you should also decide
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-[#5a5a78]">
            <li>SLA clocks live — ✕ Breached / ▲ At risk / ✓ On track (filter: Breached)</li>
            <li>CSAT 1–5 + close reason on Mark resolved</li>
            <li>Delivery ops panel — dead-letter ingest + stuck outbox retry</li>
            <li>Macros: builtins + Help Files tagged macro / isMacro</li>
            <li>Email webhook `/api/webhooks/support-email` · IVR `/api/webhooks/support-ivr`</li>
            <li>Public Help Center lite at `/help-center`</li>
            <li>Requester identity — only billing contact authorizes spend</li>
            <li>When NOT to use Knights (secrets, legal, HR)</li>
          </ul>
          <p className="mt-2 font-mono text-[10px] text-[#D4AF37]">
            docs/SUPPORT_90_DAY_PLAN.md · docs/HELP_DESK.md
          </p>
        </details>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a]"
          aria-label="New text ticket"
        >
          New ticket
        </button>
        <button
          type="button"
          onClick={() => setShowVoice(true)}
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Log voice call dictation"
        >
          Log voice call
        </button>
        <button
          type="button"
          onClick={() => setShowFeature(true)}
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Request custom build"
        >
          Request custom build
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void simulateCustomerChange()}
          className="rounded-lg border border-[#f59e0b] bg-[#1a1a26] px-3 py-1.5 text-xs text-white transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-40"
          aria-label="Simulate customer change request test scenario"
        >
          {busy === 'test-scenario' ? 'Seeding…' : 'Simulate customer change request'}
        </button>
        <button
          type="button"
          onClick={() => refresh()}
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Refresh help desk"
        >
          Refresh
        </button>
      </div>

      {scenario && (
        <TestScenarioChecklist
          scenario={scenario}
          busy={busy}
          onRefresh={refresh}
        />
      )}

      <PricingReferenceCard />

      {error && (
        <div className="flex items-center gap-2 text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span>
          <span>Error: {error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Ticket list */}
        <section
          className="flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-3 lg:col-span-4"
          aria-label="Ticket list"
        >
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 ${
                  filter === f.key
                    ? 'border-[#D4AF37] text-[#D4AF37]'
                    : 'border-[#2a2a3f] text-[#5a5a78] hover:text-[#a0a0b8]'
                }`}
                aria-label={`Filter ${f.label}`}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Intake gate filter">
            {gateFilters.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGateFilter(g.key)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 ${
                  gateFilter === g.key
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-[#2a2a3f] text-[#5a5a78] hover:text-[#a0a0b8]'
                }`}
                aria-label={`Gate filter ${g.label}`}
                aria-pressed={gateFilter === g.key}
              >
                {g.label}
              </button>
            ))}
          </div>

          {listError && (
            <p className="text-xs text-[#a0a0b8]">
              <span aria-label="Error">✕</span> {listError.message}
            </p>
          )}

          {isLoading && !tickets && (
            <div className="h-40 animate-pulse rounded-lg bg-[#1a1a26]" />
          )}

          {tickets && tickets.length === 0 && (
            <EmptyState onNew={() => setShowNew(true)} onVoice={() => setShowVoice(true)} />
          )}

          <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
            {tickets?.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => selectTicket(t.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors duration-150 ${
                    selectedId === t.id
                      ? 'border-[#D4AF37] bg-[#1a1a26]'
                      : 'border-[#2a2a3f] bg-[#0a0a0f] hover:border-[#3a3a55]'
                  }`}
                  aria-label={`Open ticket ${t.subject}`}
                  aria-current={selectedId === t.id ? 'true' : undefined}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {t.echoAi && (
                      <StatusBadge
                        level="error"
                        label="◆ Echo AI"
                      />
                    )}
                    <StatusBadge level={channelLevel(t.channel)} label={t.channel} />
                    {t.sla && (
                      <StatusBadge
                        level={t.sla.status}
                        label={`${t.sla.shape} SLA ${t.sla.label}`}
                      />
                    )}
                    {t.intakeGate && (
                      <StatusBadge
                        level={GATE_BADGE[t.intakeGate].level}
                        label={GATE_BADGE[t.intakeGate].label}
                      />
                    )}
                    <StatusBadge level={statusLevel(t.status)} label={t.status.replace(/_/g, ' ')} />
                    {t.errorScope && (
                      <StatusBadge
                        level={
                          t.errorScope === 'GLOBAL'
                            ? 'error'
                            : t.errorScope === 'ACCOUNT' || t.errorScope === 'COHORT'
                              ? 'warn'
                              : 'unknown'
                        }
                        label={`${
                          t.errorScope === 'GLOBAL'
                            ? '⬤'
                            : t.errorScope === 'ACCOUNT'
                              ? '◆'
                              : t.errorScope === 'COHORT'
                                ? '▣'
                                : '○'
                        } ${t.errorScope}`}
                      />
                    )}
                    {t.errorCategory && (
                      <StatusBadge level="unknown" label={t.errorCategory} />
                    )}
                    {(t.moduleHint === 'ci' || t.moduleHint === 'pr') && (
                      <StatusBadge level="error" label="✕ CI failed" />
                    )}
                    {t.moduleHint === 'deploy' && (
                      <StatusBadge level="error" label="✕ Deploy failed" />
                    )}
                    {t.moduleHint === 'autofix' && (
                      <StatusBadge level="warn" label="⟳ Bugbot autofix" />
                    )}
                    {t.guestImpact && (
                      <StatusBadge level="error" label="▲ Guest impact" />
                    )}
                    {t.agentWorking && (
                      <StatusBadge level="warn" label="⟳ Agent + Knights" />
                    )}
                    {t.needsHumanCoreReview && (
                      <StatusBadge level="error" label="NEEDS HUMAN CORE" />
                    )}
                    {(() => {
                      const fixBadge = fixDispositionBadge({
                        status: t.status,
                        closeReason: t.closeReason,
                        subject: t.subject,
                        needsHumanCoreReview: t.needsHumanCoreReview,
                      })
                      return fixBadge ? (
                        <StatusBadge level={fixBadge.level} label={fixBadge.label} />
                      ) : null
                    })()}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-white">{t.subject}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                    {t.messageCount} msg
                    {t.occurrenceCount > 1 ? ` · ×${t.occurrenceCount}` : ''}
                    {t.productLine ? ` · ${t.productLine}` : ''} · {ago(t.updatedAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Thread + actions */}
        <section
          className="flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-3 lg:col-span-8"
          aria-label="Ticket thread and actions"
        >
          {!selectedId && (
            <EmptyState onNew={() => setShowNew(true)} onVoice={() => setShowVoice(true)} />
          )}

          {selectedId && detailLoading && !detail && (
            <div className="h-64 animate-pulse rounded-lg bg-[#1a1a26]" />
          )}

          {detailError && (
            <p className="text-sm text-[#a0a0b8]">
              <span aria-label="Error">✕</span> {detailError.message}
            </p>
          )}

          {detail && (
            <>
              <header className="border-b border-[#2a2a3f] pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.echoAi && (
                    <StatusBadge level="error" label="◆ Echo AI" />
                  )}
                  <StatusBadge
                    level={channelLevel(detail.channel)}
                    label={detail.channel}
                  />
                  {detail.intakeGate && (
                    <StatusBadge
                      level={GATE_BADGE[detail.intakeGate].level}
                      label={GATE_BADGE[detail.intakeGate].label}
                    />
                  )}
                  <StatusBadge
                    level={statusLevel(detail.status)}
                    label={detail.status.replace(/_/g, ' ')}
                  />
                  <StatusBadge level="unknown" label={`Priority ${detail.priority}`} />
                  {detail.guestImpact && (
                    <StatusBadge level="error" label="▲ Guest impact" />
                  )}
                  {detail.errorScope && (
                    <StatusBadge
                      level={
                        detail.errorScope === 'GLOBAL'
                          ? 'error'
                          : detail.errorScope === 'ACCOUNT' || detail.errorScope === 'COHORT'
                            ? 'warn'
                            : 'unknown'
                      }
                      label={`Scope ${detail.errorScope}`}
                    />
                  )}
                  {detail.errorCategory && (
                    <StatusBadge level="unknown" label={`Cat ${detail.errorCategory}`} />
                  )}
                  {(detail.moduleHint === 'ci' || detail.moduleHint === 'pr') && (
                    <StatusBadge level="error" label="✕ CI failed" />
                  )}
                  {detail.moduleHint === 'deploy' && (
                    <StatusBadge level="error" label="✕ Deploy failed" />
                  )}
                  {detail.moduleHint === 'autofix' && (
                    <StatusBadge level="warn" label="⟳ Bugbot autofix" />
                  )}
                  {detail.agentWorking && (
                    <StatusBadge level="warn" label="⟳ Agent + Knights working" />
                  )}
                  {detail.rolloutStage && (
                    <StatusBadge
                      level={detail.rolloutStage === 'fleet' ? 'ok' : 'warn'}
                      label={`Rollout ${detail.rolloutStage}`}
                    />
                  )}
                  {detail.needsHumanCoreReview && (
                    <StatusBadge level="error" label="NEEDS_HUMAN_CORE_REVIEW" />
                  )}
                  {(() => {
                    const fixBadge = fixDispositionBadge({
                      status: detail.status,
                      closeReason: detail.closeReason,
                      subject: detail.subject,
                      needsHumanCoreReview: detail.needsHumanCoreReview,
                      messageBodies: detail.messages.map((m) => m.body),
                      answer: detail.messages
                        .filter((m) => m.role === 'ADMIN')
                        .slice(-1)[0]?.body,
                    })
                    return fixBadge ? (
                      <StatusBadge level={fixBadge.level} label={fixBadge.label} />
                    ) : null
                  })()}
                </div>
                <h2 className="mt-2 text-base font-semibold tracking-tight text-white">
                  {detail.subject}
                </h2>
                <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                  {detail.requesterName ?? '—'} · {detail.clientKey ?? 'no client key'} ·{' '}
                  {ago(detail.createdAt)}
                </p>
                {detail.status === 'AWAITING_APPROVAL' && (
                  <div
                    className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#f59e0b]/40 bg-[#0a0a0f] px-3 py-2"
                    role="status"
                    aria-label="Pilot waiting for approved reply"
                  >
                    <StatusBadge level="warn" label="Pilot waiting" />
                    <p className="text-xs text-[#a0a0b8]">
                      Draft is ready — click <span className="text-white">Approve &amp; send</span> to
                      push the reply to the property Help Desk (or unlock auto-send / standby
                      low-risk TEXT).
                    </p>
                  </div>
                )}
                {(detail.intakeGate === 'BILLING' || detail.intakeGate === 'BUILD') &&
                  detail.status !== 'RESOLVED' &&
                  detail.status !== 'CLOSED' && (
                    <div
                      className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2"
                      role="status"
                      aria-label="No auto-Knights for this gate"
                    >
                      <StatusBadge
                        level="unknown"
                        label={
                          detail.intakeGate === 'BUILD'
                            ? '■ Build — no auto-reply'
                            : '● Billing — no auto-reply'
                        }
                      />
                      <p className="text-xs text-[#a0a0b8]">
                        {detail.intakeGate === 'BUILD'
                          ? 'Paid path — quote / WorkAgreement. Auto-Knights skipped.'
                          : 'Billing path — handle manually. Auto-Knights skipped.'}
                      </p>
                    </div>
                  )}
                {(detail.fingerprint || detail.affectedClientKeys.length > 0) && (
                  <div className="mt-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-2 text-[11px] text-[#a0a0b8]">
                    {detail.productLine && (
                      <p>
                        <span className="text-[#D4AF37]">Product</span> · {detail.productLine}
                        {detail.moduleHint ? ` / ${detail.moduleHint}` : ''}
                      </p>
                    )}
                    {(detail.cohortBrowser || detail.cohortOs || detail.cohortAppVersion) && (
                      <p className="mt-0.5">
                        <span className="text-[#D4AF37]">Cohort</span> ·{' '}
                        {[detail.cohortBrowser, detail.cohortOs, detail.cohortAppVersion]
                          .filter(Boolean)
                          .join(' / ')}
                      </p>
                    )}
                    {detail.fingerprint && (
                      <p className="mt-0.5 font-mono text-[10px] text-[#5a5a78]">
                        fp {detail.fingerprint.slice(0, 16)}… · ×{detail.occurrenceCount}
                        {detail.lastOccurredAt ? ` · last ${ago(detail.lastOccurredAt)}` : ''}
                      </p>
                    )}
                    {detail.affectedClientKeys.length > 0 && (
                      <p className="mt-1">
                        <span className="text-[#D4AF37]">Affected clients</span> ·{' '}
                        {detail.affectedClientKeys.join(', ')}
                      </p>
                    )}
                    {detail.canaryClientKeys.length > 0 && (
                      <p className="mt-1">
                        <span className="text-[#D4AF37]">Canary</span> ·{' '}
                        {detail.canaryClientKeys.join(', ')}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detail.channel === 'SYSTEM' && detail.errorScope !== 'GLOBAL' && (
                        <button
                          type="button"
                          disabled={!!busy}
                          className="rounded border border-[#ef4444]/50 px-2 py-1 text-[10px] text-[#ef4444] transition-colors hover:bg-[#1a1a26] disabled:opacity-40"
                          aria-label="Promote error scope to GLOBAL"
                          onClick={() => void promoteScope('GLOBAL')}
                        >
                          Promote to GLOBAL
                        </button>
                      )}
                      {detail.channel === 'SYSTEM' && detail.errorScope !== 'COHORT' && detail.errorScope !== 'GLOBAL' && (
                        <button
                          type="button"
                          disabled={!!busy}
                          className="rounded border border-[#f59e0b]/50 px-2 py-1 text-[10px] text-[#f59e0b] transition-colors hover:bg-[#1a1a26] disabled:opacity-40"
                          aria-label="Promote error scope to COHORT"
                          onClick={() => void promoteScope('COHORT')}
                        >
                          Promote to COHORT
                        </button>
                      )}
                      {detail.channel === 'SYSTEM' && detail.errorScope === 'GLOBAL' && (
                        <>
                          <button
                            type="button"
                            disabled={!!busy}
                            className="rounded border border-[#D4AF37]/50 px-2 py-1 text-[10px] text-[#D4AF37] transition-colors hover:bg-[#1a1a26] disabled:opacity-40"
                            aria-label="Configure canary then fleet rollout"
                            onClick={() => void setCanaryThenFleet()}
                          >
                            Canary then fleet
                          </button>
                          {detail.rolloutStage === 'canary' && (
                            <button
                              type="button"
                              disabled={!!busy}
                              className="rounded border border-[#22c55e]/50 px-2 py-1 text-[10px] text-[#22c55e] transition-colors hover:bg-[#1a1a26] disabled:opacity-40"
                              aria-label="Promote canary to full fleet notify"
                              onClick={() => void promoteCanaryFleet()}
                            >
                              Promote canary → fleet
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
                {policyVerdict && (
                  <div className="mt-3">
                    <PolicyRecommendationBanner verdict={policyVerdict} />
                  </div>
                )}
              </header>

              {/* Voice notes */}
              {detail.voiceNotes.length > 0 && (
                <div className="flex flex-col gap-2">
                  {detail.voiceNotes.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg border border-[#f59e0b]/40 bg-[#0a0a0f] p-3"
                    >
                      <StatusBadge level="warn" label="Voice dictation" />
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#a0a0b8]">
                        {v.transcript}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                        {v.source}
                        {v.durationSec != null ? ` · ${v.durationSec}s` : ''} · {ago(v.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Pilot screenshots — shape+label, not color-only */}
              {(detail.attachments?.length ?? 0) > 0 && (
                <div
                  className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3"
                  aria-label={`${detail.attachments.length} screenshot attachments`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      level="ok"
                      label={`${detail.attachments.length} screenshot${detail.attachments.length === 1 ? '' : 's'}`}
                    />
                    <span className="text-[11px] text-[#5a5a78]">
                      ▦ User attached — review for fix context (prefer Help Desk over Bugbot Autofix)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {detail.attachments.map((a, i) => (
                      <a
                        key={a.id}
                        href={a.thumbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col gap-1"
                        aria-label={`Open screenshot ${i + 1}: ${a.altText || a.fileName || a.mimeType}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.thumbUrl}
                          alt={a.altText || `Screenshot ${i + 1}`}
                          className="h-28 w-auto max-w-[180px] rounded-md border border-[#2a2a3f] object-contain bg-[#12121a] transition-opacity duration-150 group-hover:opacity-90"
                        />
                        <span className="max-w-[180px] truncate font-mono text-[10px] text-[#a0a0b8]">
                          ▦ {a.altText || `Shot ${i + 1}`} ·{' '}
                          {Math.round(a.byteSize / 1024)} KB
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 ${
                      m.role === 'KNIGHT'
                        ? 'border-[#D4AF37]/50 bg-[#1a1a26]'
                        : m.role === 'ADMIN'
                          ? 'border-[#22c55e]/40 bg-[#0a0a0f]'
                          : m.role === 'SYSTEM'
                            ? 'border-[#2a2a3f] bg-transparent'
                            : 'border-[#2a2a3f] bg-[#0a0a0f]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-[#D4AF37]">
                        {roleLabel(m.role, m.seat)}
                      </span>
                      {m.body.startsWith('[Voice dictation') && (
                        <StatusBadge level="warn" label="Voice dictation" />
                      )}
                      <span className="font-mono text-[10px] text-[#5a5a78]">
                        {ago(m.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#a0a0b8]">{m.body}</p>
                  </div>
                ))}
              </div>

              {/* Reply + macros */}
              <div className="flex flex-col gap-2 border-t border-[#2a2a3f] pt-3">
                <label className="text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hd-reply">
                  Reply
                </label>
                <textarea
                  id="hd-reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Type your reply… (Approve before anything is official)"
                  className="w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
                  aria-label="Reply message"
                />
                <div className="flex flex-wrap gap-1.5">
                  {(macros ?? []).map((macro) => (
                    <button
                      key={macro.id}
                      type="button"
                      onClick={() => setReply(macro.body)}
                      className="rounded-full border border-[#2a2a3f] px-2 py-0.5 text-[10px] text-[#5a5a78] hover:border-[#D4AF37] hover:text-[#D4AF37]"
                      aria-label={`Insert macro ${macro.label}`}
                    >
                      {macro.source === 'article' ? '📄 ' : ''}
                      {macro.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CSAT + resolve */}
              {detail.status !== 'RESOLVED' && detail.status !== 'CLOSED' ? (
                <div className="flex flex-col gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">
                    Resolve · CSAT
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="CSAT score 1 to 5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCsatScore(n)}
                        className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
                          csatScore === n
                            ? 'border-[#D4AF37] text-[#D4AF37]'
                            : 'border-[#2a2a3f] text-[#5a5a78]'
                        }`}
                        aria-label={`CSAT ${n} of 5`}
                        aria-pressed={csatScore === n}
                      >
                        ★{n}
                      </button>
                    ))}
                  </div>
                  <label className="text-[10px] text-[#5a5a78]" htmlFor="hd-close-reason">
                    Close reason
                  </label>
                  <select
                    id="hd-close-reason"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-xs text-white"
                    aria-label="Close reason"
                  >
                    <option value="resolved_howto">Resolved · how-to</option>
                    <option value="resolved_config">Resolved · config</option>
                    <option value="resolved_fix">Resolved · fix (on deploy branch)</option>
                    <option value="reply_sent_code_pending">
                      Reply sent · code not deployed
                    </option>
                    <option value="duplicate">Duplicate</option>
                    <option value="spam">Spam</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              ) : detail.csatScore != null ? (
                <StatusBadge level="ok" label={`★ CSAT ${detail.csatScore}/5`} />
              ) : null}

              {/*
                Action dock first (1–2 clicks) — Approve sits with dry-run / toolbelt
                so operators never scroll past Approve to find Dry-run at the bottom.
              */}
              <div
                className="sticky bottom-0 z-20 -mx-1 space-y-2 rounded-xl border border-[#D4AF37]/35 bg-[#0a0a0f]/95 p-3 backdrop-blur-sm"
                aria-label="Ticket action dock"
              >
                <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">
                  Action dock · approve before scroll
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!busy || !reply.trim()}
                    onClick={sendReply}
                    className="rounded-lg border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8] disabled:opacity-40"
                    aria-label="Post reply to thread"
                  >
                    {busy === 'reply' ? 'Sending…' : 'Post reply'}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={askKnights}
                    className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-4 py-2 text-xs font-medium text-[#D4AF37] disabled:opacity-40"
                    aria-label="Ask the Knights for a draft"
                  >
                    {busy === 'knights' ? 'Asking Knights…' : 'Ask the Knights'}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => approve('reply')}
                    className="rounded-lg border border-[#22c55e] px-3 py-2 text-xs text-white disabled:opacity-40"
                    aria-label="Approve and send official answer"
                  >
                    {busy === 'approve' ? '…' : 'Approve & send'}
                  </button>
                  {detail.channel === 'FEATURE' && (
                    <>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => approve('approve_free')}
                        className="rounded-lg border border-[#22c55e] px-3 py-2 text-xs text-white disabled:opacity-40"
                        aria-label="Approve as free complimentary work"
                      >
                        Approve free
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => approve('send_quote')}
                        className="rounded-lg border border-[#f59e0b] px-3 py-2 text-xs text-white disabled:opacity-40"
                        aria-label="Send quote for custom build"
                      >
                        Send quote
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={!!busy || detail.status === 'RESOLVED'}
                    onClick={markResolved}
                    className="rounded-lg border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8] disabled:opacity-40"
                    aria-label="Mark ticket resolved"
                  >
                    Mark resolved
                  </button>
                </div>
                <ToolbeltPanel
                  clientKey={detail.clientKey}
                  ticketId={detail.id}
                  workRequestId={detail.workRequestId}
                  compact
                />
              </div>

              <ClientAssistPanel
                ticket={detail}
                reply={reply}
                busy={busy}
                onBusy={setBusy}
                onError={setError}
                onTicket={(t) => {
                  setSelectedId(t.id)
                  void mutateDetail()
                  void mutateList()
                }}
                onSetReply={setReply}
              />

              <TicketTimeline ticketId={detail.id} />
            </>
          )}
        </section>
      </div>

      {showNew && (
        <NewTicketModal
          onClose={() => setShowNew(false)}
          onCreated={(t) => {
            setShowNew(false)
            selectTicket(t.id)
            void mutateList()
          }}
        />
      )}
      {showVoice && (
        <VoiceLogModal
          ticketId={selectedId}
          onClose={() => setShowVoice(false)}
          onCreated={(t) => {
            setShowVoice(false)
            selectTicket(t.id)
            void mutateList()
          }}
        />
      )}
      {showFeature && (
        <FeatureRequestModal
          onClose={() => setShowFeature(false)}
          onCreated={(t) => {
            setShowFeature(false)
            selectTicket(t.id)
            void mutateList()
          }}
        />
      )}
    </div>
  )
}

function EmptyState({ onNew, onVoice }: { onNew: () => void; onVoice: () => void }) {
  return (
    <div className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-6 text-center">
      <StatusBadge level="ok" label="Ready" />
      <p className="mt-3 text-sm font-medium text-white">Knights of the Round Table Help Desk</p>
      <p className="mt-2 text-xs text-[#a0a0b8]">
        Open text tickets, log voice call dictation, Ask the Knights for drafts (you approve before
        anything is official), or request a custom build. Customer-facing intake arrives via relay
        later — for now you operate from here and Inbox.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37]"
          aria-label="Create first ticket"
        >
          New ticket
        </button>
        <button
          type="button"
          onClick={onVoice}
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8]"
          aria-label="Log first voice call"
        >
          Log voice call
        </button>
      </div>
    </div>
  )
}

function NewTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (t: HelpTicketDetail) => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [clientKey, setClientKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/help-desk/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'TEXT',
          subject,
          body,
          clientKey: clientKey || undefined,
        }),
      })
      const json = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!json.success) throw new Error(json.error)
      onCreated(json.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="New text ticket" onClose={onClose}>
      <Field label="Subject" id="nt-subject" value={subject} onChange={setSubject} />
      <Field label="Client key (optional)" id="nt-client" value={clientKey} onChange={setClientKey} />
      <TextArea label="Details" id="nt-body" value={body} onChange={setBody} />
      {err && <p className="text-xs text-[#a0a0b8]">✕ {err}</p>}
      <ModalActions busy={busy} onCancel={onClose} onSubmit={submit} submitLabel="Create" disabled={!subject.trim()} />
    </ModalShell>
  )
}

function FeatureRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (t: HelpTicketDetail) => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [clientKey, setClientKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const verdict = useMemo(
    () =>
      classifySupportRequest({
        kind: 'ADDON',
        title: subject,
        detail: body,
      }),
    [subject, body]
  )

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/help-desk/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'FEATURE',
          subject,
          body,
          clientKey: clientKey || undefined,
          spawnWorkRequest: true,
        }),
      })
      const json = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!json.success) throw new Error(json.error)
      onCreated(json.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Request custom build" onClose={onClose}>
      <p className="text-[11px] text-[#5a5a78]">
        Creates a FEATURE ticket and a WorkRequest in the change-request pipeline.
      </p>
      <Field label="What to add" id="fr-subject" value={subject} onChange={setSubject} />
      <TextArea label="Details" id="fr-body" value={body} onChange={setBody} />
      <Field label="Client key (optional)" id="fr-client" value={clientKey} onChange={setClientKey} />
      <PolicyRecommendationBanner verdict={verdict} />
      {err && <p className="text-xs text-[#a0a0b8]">✕ {err}</p>}
      <ModalActions
        busy={busy}
        onCancel={onClose}
        onSubmit={submit}
        submitLabel="Create feature ticket"
        disabled={!subject.trim()}
      />
    </ModalShell>
  )
}

function VoiceLogModal({
  ticketId,
  onClose,
  onCreated,
}: {
  ticketId: string | null
  onClose: () => void
  onCreated: (t: HelpTicketDetail) => void
}) {
  const [transcript, setTranscript] = useState('')
  const [subject, setSubject] = useState('')
  const [listening, setListening] = useState(false)
  const [source, setSource] = useState<HelpVoiceNoteSource>('PASTE')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  const speechAvailable =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  function startDictation() {
    type SpeechRec = {
      continuous: boolean
      interimResults: boolean
      lang: string
      onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
      start: () => void
      stop: () => void
    }
    const Ctor = (
      window as unknown as {
        SpeechRecognition?: new () => SpeechRec
        webkitSpeechRecognition?: new () => SpeechRec
      }
    ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRec
        }
      ).webkitSpeechRecognition

    if (!Ctor) {
      setErr('Speech recognition not available in this browser — paste the transcript instead.')
      return
    }

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (ev) => {
      const parts: string[] = []
      for (let i = 0; i < ev.results.length; i++) {
        parts.push(ev.results[i][0].transcript)
      }
      setTranscript(parts.join(' '))
      setSource('DICTATION')
    }
    rec.onerror = () => {
      setListening(false)
      setErr('Dictation error — you can keep typing or paste.')
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
    setErr(null)
  }

  function stopDictation() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/help-desk/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          subject: subject || undefined,
          ticketId: ticketId || undefined,
          source,
        }),
      })
      const json = (await res.json()) as APIResponse<HelpTicketDetail>
      if (!json.success) throw new Error(json.error)
      onCreated(json.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Voice log failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Log voice call" onClose={onClose}>
      <p className="text-[11px] text-[#5a5a78]">
        v1: paste or dictate a transcript. Live Twilio / real phone number comes later — do not
        block on it.
      </p>
      {!ticketId && (
        <Field
          label="Subject (optional)"
          id="vc-subject"
          value={subject}
          onChange={setSubject}
        />
      )}
      <TextArea
        label="Transcript"
        id="vc-transcript"
        value={transcript}
        onChange={(v) => {
          setTranscript(v)
          if (source === 'DICTATION') return
          setSource('PASTE')
        }}
        rows={6}
      />
      <div className="flex flex-wrap gap-2">
        {speechAvailable ? (
          <button
            type="button"
            onClick={listening ? stopDictation : startDictation}
            className="rounded-lg border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37]"
            aria-label={listening ? 'Stop dictation' : 'Start browser dictation'}
          >
            {listening ? 'Stop dictation' : 'Dictate'}
          </button>
        ) : (
          <StatusBadge level="unknown" label="Dictation unavailable — paste instead" />
        )}
        <StatusBadge level="warn" label={`Source · ${source}`} />
      </div>
      {err && <p className="text-xs text-[#a0a0b8]">✕ {err}</p>}
      <ModalActions
        busy={busy}
        onCancel={onClose}
        onSubmit={submit}
        submitLabel="Save voice note"
        disabled={!transcript.trim()}
      />
    </ModalShell>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#D4AF37]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[#5a5a78] hover:text-white"
            aria-label="Close dialog"
          >
            ✕ Close
          </button>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  id,
  value,
  onChange,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-[#a0a0b8]">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
      />
    </div>
  )
}

function TextArea({
  label,
  id,
  value,
  onChange,
  rows = 4,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-[#a0a0b8]">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
      />
    </div>
  )
}

function ModalActions({
  busy,
  onCancel,
  onSubmit,
  submitLabel,
  disabled,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8]"
        aria-label="Cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={onSubmit}
        className="rounded-lg border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37] disabled:opacity-40"
        aria-label={submitLabel}
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}
