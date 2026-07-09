'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PolicyRecommendationBanner } from '@/components/support/PolicyRecommendation'
import { COMPLEXITY_TIERS, TIERS, computeQuote, formatUSD } from '@/lib/pricing'
import type { ComplexityTier } from '@/lib/pricing'
import { classifySupportRequest } from '@/lib/support-policy'
import type { APIResponse, StatusLevel } from '@/types'
import { WORK_STATUS_LABEL } from '@/types/work'
import type { WorkRequestView, WorkStatus } from '@/types/work'

const WORK_KEY = '/api/work'

async function fetcher(url: string): Promise<WorkRequestView[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<WorkRequestView[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const STATUS_LEVEL: Record<WorkStatus, StatusLevel> = {
  RECEIVED: 'warn',
  QUOTED: 'unknown',
  AUTHORIZED: 'warn',
  IN_PROGRESS: 'unknown',
  EXECUTED: 'ok',
  ROLLED_BACK: 'error',
  DECLINED: 'unknown',
}

function WorkCard({ w }: { w: WorkRequestView }) {
  const policy = classifySupportRequest({
    kind: w.kind,
    title: w.title,
    detail: w.detail,
    estimatedMinutes: w.humanHours ? w.humanHours * 60 : null,
  })
  const [tier, setTier] = useState<ComplexityTier>(w.tier ?? policy.suggestedTier ?? 'T3')
  const [hours, setHours] = useState<string>(w.humanHours ? String(w.humanHours) : '')
  const [rollback, setRollback] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const preview = computeQuote(tier, hours ? Number(hours) : undefined)

  async function call(url: string, method: string, body?: object) {
    setBusy(url)
    try {
      await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      await mutate(WORK_KEY)
    } finally {
      setBusy(null)
    }
  }

  const terminal = w.status === 'EXECUTED' || w.status === 'ROLLED_BACK' || w.status === 'DECLINED'

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-[#2a2a3f] bg-[#12121a] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white">
            <span className="text-[#D4AF37]">{w.kind === 'ADDON' ? 'Add-on' : 'Fix'}</span> · {w.title}
          </p>
          <p className="text-[11px] text-[#5a5a78]">
            {w.clientLabel ?? w.clientKey}
            {w.requesterName ? ` · ${w.requesterName}${w.requesterRole ? ` (${w.requesterRole})` : ''}` : ''}
            {' · '}
            {formatDistanceToNow(new Date(w.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {w.quoteTotal != null ? (
            <span className="font-mono text-sm tabular-nums text-white">{formatUSD(w.quoteTotal)}</span>
          ) : null}
          <StatusBadge level={STATUS_LEVEL[w.status]} label={WORK_STATUS_LABEL[w.status]} />
        </div>
      </div>

      <p className="text-xs text-[#a0a0b8]">{w.detail}</p>

      {!terminal ? <PolicyRecommendationBanner verdict={policy} /> : null}

      {w.draftPlan ? (
        <details className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3">
          <summary className="cursor-pointer text-xs text-[#D4AF37]">
            Implementation plan {w.draftSeat ? `(${w.draftSeat})` : ''}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-xs text-[#a0a0b8]">{w.draftPlan}</p>
        </details>
      ) : null}

      {w.approvedByCustomer ? (
        <p className="text-[11px] text-[#22c55e]">
          <span aria-hidden="true">✓</span>{' '}
          {w.quoteTotal === 0
            ? `Approved free by ${w.customerApprover ?? 'admin'}`
            : `Spend authorized by ${w.customerApprover}`}
        </p>
      ) : null}
      {w.status === 'EXECUTED' && w.rollbackRef ? (
        <p className="text-[11px] text-[#5a5a78]">Rollback ref: {w.rollbackRef}</p>
      ) : null}

      {!terminal ? (
        <div className="flex flex-col gap-3 border-t border-[#2a2a3f] pt-3">
          {/* Quote control */}
          {w.status === 'RECEIVED' || w.status === 'QUOTED' ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-[11px] text-[#5a5a78]">
                Tier
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as ComplexityTier)}
                  aria-label="Complexity tier"
                  className="mt-1 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                >
                  {COMPLEXITY_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t} — {TIERS[t].label} (×{TIERS[t].multiplier})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-[11px] text-[#5a5a78]">
                Human hrs
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder={String(TIERS[tier].defaultHours)}
                  aria-label="Estimated human hours"
                  className="mt-1 w-24 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </label>
              <span className="pb-1 font-mono text-sm tabular-nums text-[#D4AF37]">
                {formatUSD(preview.total)}
              </span>
              <button
                type="button"
                onClick={() => call(`/api/work/${w.id}/quote`, 'POST', { tier, humanHours: hours ? Number(hours) : undefined })}
                disabled={busy !== null}
                aria-label="Send quote to customer"
                className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-[#D4AF37] hover:bg-[#22223a] disabled:opacity-40"
              >
                {w.status === 'QUOTED' ? 'Re-quote' : 'Send quote'}
              </button>
            </div>
          ) : null}

          {/* Execute control (only once the customer has authorized) */}
          {w.status === 'AUTHORIZED' ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-1 flex-col text-[11px] text-[#5a5a78]">
                Rollback reference (required)
                <input
                  type="text"
                  value={rollback}
                  onChange={(e) => setRollback(e.target.value)}
                  placeholder="revert SHA / snapshot id / documented procedure"
                  aria-label="Rollback reference"
                  className="mt-1 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5 text-xs text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => call(`/api/work/${w.id}/execute`, 'POST', { rollbackRef: rollback.trim() })}
                disabled={busy !== null || !rollback.trim()}
                aria-label="Execute change"
                className="rounded-lg border border-[#22c55e] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#22223a] disabled:opacity-40"
              >
                Execute
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => call(`/api/work/${w.id}/draft`, 'POST')}
              disabled={busy !== null}
              aria-label="Draft plan with Knights of the Round Table"
              className="rounded-lg border border-[#2a2a3f] bg-[#1a1a26] px-3 py-1.5 text-xs text-[#a0a0b8] hover:text-white disabled:opacity-40"
            >
              {w.draftPlan ? 'Re-draft (Knights)' : 'Draft plan (Knights)'}
            </button>
            {w.status === 'RECEIVED' || w.status === 'QUOTED' ? (
              <button
                type="button"
                onClick={() =>
                  call(`/api/work/${w.id}`, 'PATCH', {
                    action: 'approve_free',
                    reason: 'Complimentary — founder approved',
                  })
                }
                disabled={busy !== null}
                aria-label="Approve this work for free"
                className="rounded-lg border border-[#22c55e] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-[#22c55e] hover:bg-[#22223a] disabled:opacity-40"
              >
                Approve free
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => call(`/api/work/${w.id}`, 'PATCH', { action: 'decline' })}
              disabled={busy !== null}
              aria-label="Decline request"
              className="rounded-lg border border-transparent px-3 py-1.5 text-xs text-[#5a5a78] hover:text-[#a0a0b8] disabled:opacity-40"
            >
              Decline
            </button>
          </div>
        </div>
      ) : w.status === 'EXECUTED' ? (
        <button
          type="button"
          onClick={() => call(`/api/work/${w.id}`, 'PATCH', { action: 'rollback' })}
          disabled={busy !== null}
          aria-label="Roll back change"
          className="self-start rounded-lg border border-[#ef4444] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#22223a] disabled:opacity-40"
        >
          Roll back
        </button>
      ) : null}
    </li>
  )
}

export function WorkRequestsPanel() {
  const { data, error } = useSWR(WORK_KEY, fetcher, { refreshInterval: 60_000 })
  const open = data?.filter((w) => !['EXECUTED', 'ROLLED_BACK', 'DECLINED'].includes(w.status)).length ?? 0

  return (
    <KPICard
      title="Change Requests"
      badge={data ? <StatusBadge level={open > 0 ? 'warn' : 'ok'} label={open > 0 ? 'In queue' : 'Clear'} count={open} /> : undefined}
    >
      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-hidden="true">✕</span> Requests unavailable: {error.message}
        </p>
      ) : !data ? (
        <p className="text-sm text-[#a0a0b8]">Loading requests…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-[#a0a0b8]">
          No change requests yet. Flow: customer asks → Knights draft → you Approve free or Send quote
          → (if charged) billing contact authorizes → you Execute with a rollback reference. Nothing
          ships without your approval.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((w) => (
            <WorkCard key={w.id} w={w} />
          ))}
        </ul>
      )}
    </KPICard>
  )
}
