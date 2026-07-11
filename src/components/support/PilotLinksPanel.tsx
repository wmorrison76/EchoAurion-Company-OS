'use client'

import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { HEALTH_LABEL, HEALTH_TO_STATUS } from '@/lib/support'
import type { APIResponse } from '@/types'
import type { PilotLinksPayload } from '@/app/api/support/pilot-links/route'
import type { StandbyConfig } from '@/lib/standby'
import type { StandbyReviewItem } from '@/app/api/support/standby/queue/route'
import { useState } from 'react'

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

/**
 * Pilot Connection Hub — clients, heartbeat, stream, standby review queue.
 */
export function PilotLinksPanel() {
  const { data, error, mutate, isLoading } = useSWR(
    '/api/support/pilot-links',
    jsonFetcher<PilotLinksPayload>,
    { refreshInterval: 30_000 }
  )
  const { data: standby, mutate: mutateStandby } = useSWR(
    '/api/support/standby',
    jsonFetcher<StandbyConfig>,
    { refreshInterval: 60_000 }
  )
  const { data: queue } = useSWR(
    '/api/support/standby/queue',
    jsonFetcher<StandbyReviewItem[]>,
    { refreshInterval: 60_000 }
  )
  const [busy, setBusy] = useState(false)

  async function setMode(mode: StandbyConfig['mode']) {
    setBusy(true)
    try {
      await fetch('/api/support/standby', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      await mutateStandby()
      await mutate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          title="Pilots online"
          badge={
            <StatusBadge
              level={(data?.onlineCount ?? 0) > 0 ? 'ok' : 'unknown'}
              label={(data?.onlineCount ?? 0) > 0 ? 'Heartbeat' : 'None'}
            />
          }
        >
          <KPIValue
            value={isLoading ? '…' : String(data?.onlineCount ?? 0)}
            sub="heartbeat under 5 min"
          />
        </KPICard>
        <KPICard
          title="SSE streams"
          badge={
            <StatusBadge
              level={(data?.streamCount ?? 0) > 0 ? 'ok' : 'unknown'}
              label={(data?.streamCount ?? 0) > 0 ? 'Connected' : 'Idle'}
            />
          }
        >
          <KPIValue
            value={isLoading ? '…' : String(data?.streamCount ?? 0)}
            sub="stream touch under 2 min"
          />
        </KPICard>
        <KPICard
          title="Standby review"
          badge={
            <StatusBadge
              level={(data?.standbyReviewCount ?? 0) > 0 ? 'warn' : 'ok'}
              label={(data?.standbyReviewCount ?? 0) > 0 ? 'Review' : 'Clear'}
            />
          }
        >
          <KPIValue
            value={isLoading ? '…' : String(data?.standbyReviewCount ?? 0)}
            sub="auto-answers (7d)"
          />
        </KPICard>
      </div>

      {(queue?.length ?? 0) > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-[#f59e0b] bg-[#1a1a26] px-4 py-3"
          aria-label="Standby approved — review queue"
        >
          <p className="text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
            Standby approved — review queue
          </p>
          <ul className="mt-2 space-y-2">
            {queue!.slice(0, 8).map((item) => (
              <li key={item.id} className="text-sm text-[#a0a0b8]">
                <span className="font-mono text-xs text-[#5a5a78]">{item.clientKey}</span>
                <span className="mx-2 text-[#5a5a78]">·</span>
                <span className="text-white">{item.question.slice(0, 80)}</span>
                <span className="ml-2 text-xs text-[#5a5a78]">{ago(item.answeredAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
              Autonomy dial
            </p>
            <p className="mt-1 text-xs text-[#a0a0b8]">
              Mode:{' '}
              <span className="font-mono text-white">{standby?.mode ?? data?.standbyMode ?? 'assist'}</span>
              {' · '}assist = draft · standby/autopilot = auto TEXT · never merge/paid/T3+
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['assist', 'Assist'],
                ['standby', 'Standby'],
                ['autopilot', 'Autopilot'],
                ['off', 'Off (legacy)'],
                ['draft_only', 'Draft only'],
                ['auto_answer_low_risk', 'Auto low-risk'],
              ] as const
            ).map(([mode, label]) => {
              const active = (standby?.mode ?? 'off') === mode
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={busy}
                  aria-label={`Set autonomy/standby mode to ${label}`}
                  aria-pressed={active}
                  onClick={() => void setMode(mode)}
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
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span>
          <span>Error: {error.message}</span>
          <button
            type="button"
            onClick={() => void mutate()}
            className="text-xs text-[#D4AF37] underline"
            aria-label="Retry loading pilot links"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#2a2a3f]">
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="bg-[#12121a] text-xs uppercase tracking-widest text-[#D4AF37]">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Heartbeat</th>
              <th className="px-4 py-3">Stream</th>
              <th className="px-4 py-3">Outbox</th>
            </tr>
          </thead>
          <tbody>
            {(data?.clients ?? []).map((c, i) => (
              <tr
                key={c.id}
                className={i % 2 === 0 ? 'bg-[#0a0a0f]' : 'bg-[#12121a]'}
              >
                <td className="px-4 py-3">
                  <p className="text-white">{c.label}</p>
                  <p className="font-mono text-xs text-[#5a5a78]">{c.clientKey}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    level={HEALTH_TO_STATUS[c.health]}
                    label={HEALTH_LABEL[c.health]}
                  />
                </td>
                <td className="px-4 py-3 text-[#a0a0b8]">
                  <StatusBadge
                    level={c.online ? 'ok' : 'unknown'}
                    label={c.online ? 'Online' : 'Offline'}
                  />
                  <span className="ml-2 text-xs">{ago(c.lastHeartbeatAt)}</span>
                </td>
                <td className="px-4 py-3 text-[#a0a0b8]">
                  <StatusBadge
                    level={c.streamConnected ? 'ok' : 'unknown'}
                    label={c.streamConnected ? 'Connected' : 'Disconnected'}
                  />
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-white">
                  {c.pendingOutbox}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.clients.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#5a5a78]">
                  No pilots connected yet — waiting for heartbeat / diagnostics.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="flex flex-col gap-3 p-3 md:hidden">
          {(data?.clients ?? []).map((c) => (
            <div key={c.id} className="rounded-lg border border-[#2a2a3f] bg-[#12121a] p-3">
              <p className="text-sm text-white">{c.label}</p>
              <p className="font-mono text-xs text-[#5a5a78]">{c.clientKey}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge level={HEALTH_TO_STATUS[c.health]} label={HEALTH_LABEL[c.health]} />
                <StatusBadge
                  level={c.online ? 'ok' : 'unknown'}
                  label={c.online ? 'Online' : 'Offline'}
                />
                <StatusBadge
                  level={c.streamConnected ? 'ok' : 'unknown'}
                  label={c.streamConnected ? 'Stream' : 'No stream'}
                />
              </div>
              <p className="mt-2 text-xs text-[#a0a0b8]">
                Heartbeat {ago(c.lastHeartbeatAt)} · outbox {c.pendingOutbox}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
