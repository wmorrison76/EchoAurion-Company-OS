'use client'

import useSWR, { mutate } from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { NotifyButton } from '@/components/pwa/NotifyButton'
import type { APIResponse, StatusLevel } from '@/types'
import type { AlertSeverity, AlertView } from '@/types/support'

const ALERTS_KEY = '/api/alerts'

async function fetcher(url: string): Promise<AlertView[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<AlertView[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const SEVERITY: Record<AlertSeverity, { level: StatusLevel; label: string }> = {
  INFO: { level: 'unknown', label: 'Info' },
  WARN: { level: 'warn', label: 'Warning' },
  CRITICAL: { level: 'error', label: 'Critical' },
}

export function AlertsPanel() {
  const { data, error } = useSWR(ALERTS_KEY, fetcher, { refreshInterval: 60_000 })
  const unread = data?.filter((a) => !a.read).length ?? 0

  async function markRead(id: string) {
    await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    await mutate(ALERTS_KEY)
  }

  return (
    <KPICard
      title="Alerts"
      badge={data ? <StatusBadge level={unread > 0 ? 'warn' : 'ok'} label={unread > 0 ? 'Unread' : 'All clear'} count={unread} /> : undefined}
    >
      <div className="mb-3">
        <NotifyButton />
      </div>
      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-hidden="true">✕</span> Alerts unavailable: {error.message}
        </p>
      ) : !data ? (
        <p className="text-sm text-[#a0a0b8]">Loading alerts…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-[#a0a0b8]">No alerts. New questions and at-risk clients show up here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#2a2a3f]">
          {data.map((a) => {
            const sev = SEVERITY[a.severity]
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className={a.read ? 'text-sm text-[#a0a0b8]' : 'text-sm text-white'}>{a.title}</p>
                  {a.body ? <p className="text-[11px] text-[#5a5a78]">{a.body}</p> : null}
                  <p className="text-[11px] text-[#5a5a78]">
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge level={sev.level} label={sev.label} />
                  {!a.read ? (
                    <button
                      type="button"
                      onClick={() => markRead(a.id)}
                      aria-label={`Mark alert read: ${a.title}`}
                      className="text-xs text-[#D4AF37] underline transition-colors duration-150 hover:text-[#f0c840]"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </KPICard>
  )
}
