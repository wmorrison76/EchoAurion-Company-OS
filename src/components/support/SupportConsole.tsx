'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { HEALTH_LABEL, HEALTH_TO_STATUS } from '@/lib/support'
import { QuestionsPanel } from './QuestionsPanel'
import { WorkRequestsPanel } from './WorkRequestsPanel'
import { AlertsPanel } from './AlertsPanel'
import { SupportPolicyCard } from './SupportPolicyCard'
import type { APIResponse } from '@/types'
import type { SupportClientView, SupportSessionView } from '@/types/support'

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function ago(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

const SESSION_BADGE: Record<SupportSessionView['status'], { level: 'ok' | 'warn' | 'unknown'; label: string }> = {
  OPEN: { level: 'warn', label: 'Open' },
  WAITING_ON_CUSTOMER: { level: 'unknown', label: 'Waiting on customer' },
  RESOLVED: { level: 'ok', label: 'Resolved' },
}

export function SupportConsole() {
  const { data: clients, error: clientsError } = useSWR('/api/support/clients', jsonFetcher<SupportClientView[]>, {
    refreshInterval: 60_000,
  })
  const { data: sessions, error: sessionsError } = useSWR(
    '/api/support/sessions',
    jsonFetcher<SupportSessionView[]>,
    { refreshInterval: 60_000 }
  )

  const [topic, setTopic] = useState('')
  const [clientId, setClientId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const total = clients?.length ?? 0
  const attention = clients?.filter((c) => c.health === 'AMBER' || c.health === 'RED').length ?? 0
  const openSessions = sessions?.filter((s) => s.status !== 'RESOLVED').length ?? 0

  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/support/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), clientId: clientId || undefined }),
      })
      setTopic('')
      setClientId('')
      await mutate('/api/support/sessions')
    } finally {
      setSubmitting(false)
    }
  }

  async function setStatus(id: string, status: SupportSessionView['status']) {
    await fetch(`/api/support/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await mutate('/api/support/sessions')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard title="Clients">
          <KPIValue value={String(total)} sub="reporting in" />
        </KPICard>
        <KPICard
          title="Needs Attention"
          badge={
            <StatusBadge level={attention > 0 ? 'warn' : 'ok'} label={attention > 0 ? 'Review' : 'Clear'} />
          }
        >
          <KPIValue value={String(attention)} sub="amber or at-risk" />
        </KPICard>
        <KPICard title="Open Sessions">
          <KPIValue value={String(openSessions)} sub="not yet resolved" />
        </KPICard>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href="/support/inbox"
          className="rounded-lg border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37] transition-colors duration-150 hover:bg-[#1a1a26]"
          aria-label="Open unified Support inbox"
        >
          Unified inbox →
        </a>
        <a
          href="/support/pilot-links"
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:bg-[#1a1a26] hover:text-white"
          aria-label="Open Pilot Connection Hub"
        >
          Pilot links →
        </a>
      </div>

      <SupportPolicyCard />

      {/* Ask the Board + billable change requests + Alerts */}
      <div id="questions">
        <QuestionsPanel />
      </div>
      <div id="work">
        <WorkRequestsPanel />
      </div>
      <AlertsPanel />

      {/* Client health */}
      <KPICard title="Client Health">
        {clientsError ? (
          <p className="text-sm text-[#a0a0b8]">
            <span aria-hidden="true">✕</span> Client roster unavailable: {clientsError.message}
          </p>
        ) : !clients ? (
          <p className="text-sm text-[#a0a0b8]">Loading clients…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-[#a0a0b8]">
            No clients reporting yet. Once a product install posts diagnostics to{' '}
            <code className="font-mono text-[#5a5a78]">/api/support/diagnostics</code>, it appears here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-[#D4AF37]">
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">Property</th>
                  <th className="py-2 pr-4 font-medium">Version</th>
                  <th className="py-2 pr-4 font-medium">Queue</th>
                  <th className="py-2 pr-4 font-medium">Last sync</th>
                  <th className="py-2 text-right font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'}>
                    <td className="py-2 pr-4 text-white">
                      {c.label}
                      <span className="block text-[11px] text-[#5a5a78]">
                        {c.online ? 'Online' : 'Offline'} · seen {ago(c.lastSeenAt)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-[#a0a0b8]">{c.property ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-[#a0a0b8]">{c.appVersion ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono tabular-nums text-[#a0a0b8]">{c.queueDepth}</td>
                    <td className="py-2 pr-4 text-[#a0a0b8]">{ago(c.lastSyncAt)}</td>
                    <td className="py-2 text-right">
                      <StatusBadge level={HEALTH_TO_STATUS[c.health]} label={HEALTH_LABEL[c.health]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </KPICard>

      {/* Sessions */}
      <KPICard title="Support Sessions">
        <form onSubmit={createSession} className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="New session topic (e.g. Kitchen 1 printer not firing)"
            aria-label="New support session topic"
            className="flex-1 rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
          />
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            aria-label="Link session to client"
            className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-[#a0a0b8] focus:border-[#D4AF37] focus:outline-none"
          >
            <option value="">No client</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting || !topic.trim()}
            aria-label="Open support session"
            className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-4 py-2 text-sm font-medium text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-40"
          >
            {submitting ? 'Opening…' : 'Open session'}
          </button>
        </form>

        {sessionsError ? (
          <p className="text-sm text-[#a0a0b8]">
            <span aria-hidden="true">✕</span> Sessions unavailable: {sessionsError.message}
          </p>
        ) : !sessions ? (
          <p className="text-sm text-[#a0a0b8]">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[#a0a0b8]">No support sessions yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#2a2a3f]">
            {sessions.map((s) => {
              const badge = SESSION_BADGE[s.status]
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm text-white">{s.topic}</p>
                    <p className="text-[11px] text-[#5a5a78]">
                      {s.clientLabel ?? 'Unlinked'} · opened {ago(s.openedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge level={badge.level} label={badge.label} />
                    {s.status !== 'RESOLVED' ? (
                      <button
                        type="button"
                        onClick={() => setStatus(s.id, 'RESOLVED')}
                        aria-label={`Resolve session: ${s.topic}`}
                        className="text-xs text-[#D4AF37] underline transition-colors duration-150 hover:text-[#f0c840]"
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </KPICard>
    </div>
  )
}
