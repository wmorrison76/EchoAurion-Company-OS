'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { format, formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type {
  MaintenanceNoticeView,
  MaintenanceSeverity,
  MaintenanceTargetScope,
} from '@/types/maintenance'
import type { SupportClientView } from '@/types/support'

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function severityBadge(severity: MaintenanceSeverity): { level: 'ok' | 'warn' | 'error'; label: string } {
  if (severity === 'CRITICAL') return { level: 'error', label: '✕ Critical' }
  if (severity === 'WARN') return { level: 'warn', label: '⚠ Warn' }
  return { level: 'ok', label: '✓ Info' }
}

function statusBadge(status: MaintenanceNoticeView['status']): {
  level: 'ok' | 'warn' | 'error' | 'unknown'
  label: string
} {
  if (status === 'SENT') return { level: 'ok', label: '✓ Sent' }
  if (status === 'SCHEDULED') return { level: 'warn', label: '↻ Scheduled' }
  if (status === 'CANCELLED') return { level: 'unknown', label: '— Cancelled' }
  return { level: 'unknown', label: '? Draft' }
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * Compose, schedule, and review maintenance / major-update notices for pilots.
 */
export function MaintenanceConsole() {
  const { data: notices, error, mutate, isLoading } = useSWR(
    '/api/maintenance',
    jsonFetcher<MaintenanceNoticeView[]>,
    { refreshInterval: 30_000 }
  )
  const { data: clients } = useSWR('/api/support/clients', jsonFetcher<SupportClientView[]>)

  const properties = useMemo(() => {
    const set = new Set<string>()
    for (const c of clients ?? []) {
      if (c.property?.trim()) set.add(c.property.trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [clients])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<MaintenanceSeverity>('INFO')
  const [targetScope, setTargetScope] = useState<MaintenanceTargetScope>('ALL')
  const [targetValue, setTargetValue] = useState('')
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return toLocalInputValue(d)
  })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const previewSeverity = severityBadge(severity)

  async function createNotice(then: 'draft' | 'schedule' | 'send'): Promise<void> {
    setFormError(null)
    setActionMsg(null)
    if (!title.trim() || !body.trim()) {
      setFormError('Title and body are required')
      return
    }
    if (targetScope !== 'ALL' && !targetValue.trim()) {
      setFormError('Target value is required for this scope')
      return
    }

    setBusy(true)
    try {
      const createRes = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          severity,
          targetScope,
          targetValue: targetScope === 'ALL' ? null : targetValue.trim(),
          windowStart: fromLocalInput(windowStart),
          windowEnd: fromLocalInput(windowEnd),
        }),
      })
      const created = (await createRes.json()) as APIResponse<MaintenanceNoticeView>
      if (!created.success) throw new Error(created.error)

      if (then === 'send') {
        const sendRes = await fetch(`/api/maintenance/${created.data.id}/send-now`, {
          method: 'POST',
        })
        const sent = (await sendRes.json()) as APIResponse<{
          notice: MaintenanceNoticeView
          delivered: number
        }>
        if (!sent.success) throw new Error(sent.error)
        setActionMsg(`Sent to ${sent.data.delivered} pilot(s)`)
      } else if (then === 'schedule') {
        const iso = fromLocalInput(scheduleAt)
        if (!iso) throw new Error('Invalid schedule time')
        const schedRes = await fetch(`/api/maintenance/${created.data.id}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledFor: iso }),
        })
        const scheduled = (await schedRes.json()) as APIResponse<MaintenanceNoticeView>
        if (!scheduled.success) throw new Error(scheduled.error)
        setActionMsg(`Scheduled for ${format(new Date(iso), 'PPp')}`)
      } else {
        setActionMsg('Draft saved')
      }

      setTitle('')
      setBody('')
      setTargetValue('')
      setWindowStart('')
      setWindowEnd('')
      await mutate()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function runAction(
    id: string,
    path: 'cancel' | 'send-now',
    label: string
  ): Promise<void> {
    setActionMsg(null)
    setFormError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/maintenance/${id}/${path}`, { method: 'POST' })
      const json = (await res.json()) as APIResponse<unknown>
      if (!json.success) throw new Error(json.error)
      setActionMsg(label)
      await mutate()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {(formError || actionMsg || error) && (
        <div
          role="status"
          className="rounded-xl border border-[#2a2a3f] bg-[#1a1a26] px-4 py-3 text-sm"
          aria-label={formError || error ? 'Error' : 'Status'}
        >
          {formError || error ? (
            <span className="text-[#a0a0b8]">
              <span aria-label="Error">✕</span> {formError ?? (error as Error).message}
            </span>
          ) : (
            <span className="text-[#a0a0b8]">
              <span aria-label="Ok">✓</span> {actionMsg}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Compose */}
        <section
          className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4 sm:p-6"
          aria-label="Compose maintenance notice"
        >
          <h2 className="text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
            Compose notice
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#a0a0b8]">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Notice title"
                className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
                placeholder="Scheduled maintenance"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#a0a0b8]">Body</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Notice body"
                rows={4}
                className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
                placeholder="We will be offline briefly for a platform update…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#a0a0b8]">Severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as MaintenanceSeverity)}
                aria-label="Notice severity"
                className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
              >
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#a0a0b8]">Target</span>
              <select
                value={targetScope}
                onChange={(e) => {
                  setTargetScope(e.target.value as MaintenanceTargetScope)
                  setTargetValue('')
                }}
                aria-label="Target scope"
                className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
              >
                <option value="ALL">All pilots</option>
                <option value="CLIENT_KEY">One clientKey</option>
                <option value="PROPERTY">Property / group</option>
              </select>
            </label>
            {targetScope === 'CLIENT_KEY' ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#a0a0b8]">Client key</span>
                <select
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  aria-label="Target client key"
                  className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
                >
                  <option value="">Select…</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.clientKey}>
                      {c.label} ({c.clientKey})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {targetScope === 'PROPERTY' ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#a0a0b8]">Property</span>
                <select
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  aria-label="Target property"
                  className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
                >
                  <option value="">Select…</option>
                  {properties.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#a0a0b8]">Window start (optional)</span>
                <input
                  type="datetime-local"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  aria-label="Maintenance window start"
                  className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#a0a0b8]">Window end (optional)</span>
                <input
                  type="datetime-local"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  aria-label="Maintenance window end"
                  className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#a0a0b8]">Schedule send at</span>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                aria-label="Schedule send time"
                className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-white"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void createNotice('send')}
                aria-label="Send notice now"
                className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2 text-sm text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-50"
              >
                Send now
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createNotice('schedule')}
                aria-label="Schedule notice"
                className="rounded-lg border border-[#2a2a3f] bg-[#1a1a26] px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-50"
              >
                Schedule
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createNotice('draft')}
                aria-label="Save as draft"
                className="rounded-lg border border-[#2a2a3f] px-3 py-2 text-sm text-[#a0a0b8] transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-50"
              >
                Save draft
              </button>
            </div>
          </div>
        </section>

        {/* Preview */}
        <section
          className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4 sm:p-6"
          aria-label="Client preview"
        >
          <h2 className="text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
            Client preview
          </h2>
          <p className="mt-1 text-xs text-[#5a5a78]">
            What pilots see via SSE <code className="font-mono">maintenance_notice</code> /{' '}
            <code className="font-mono">show_message</code>
          </p>
          <div
            className="mt-4 rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-4"
            role="article"
            aria-label="Preview of maintenance notice"
          >
            <div className="flex items-center gap-2">
              <StatusBadge level={previewSeverity.level} label={previewSeverity.label} />
              <span className="text-xs uppercase tracking-widest text-[#5a5a78]">
                Maintenance
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">
              {title.trim() || 'Notice title'}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#a0a0b8]">
              {body.trim() || 'Notice body will appear here.'}
            </p>
            {(windowStart || windowEnd) && (
              <p className="mt-3 font-mono text-xs tabular-nums text-[#5a5a78]">
                Window:{' '}
                {windowStart ? format(new Date(windowStart), 'PPp') : '—'} →{' '}
                {windowEnd ? format(new Date(windowEnd), 'PPp') : '—'}
              </p>
            )}
            <p className="mt-2 text-xs text-[#5a5a78]">
              Target:{' '}
              {targetScope === 'ALL'
                ? 'All pilots'
                : `${targetScope}=${targetValue || '…'}`}
            </p>
          </div>
        </section>
      </div>

      {/* History */}
      <section
        className="overflow-hidden rounded-xl border border-[#2a2a3f]"
        aria-label="Notice history"
      >
        <div className="border-b border-[#2a2a3f] bg-[#12121a] px-4 py-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
            Scheduled &amp; sent
          </h2>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#2a2a3f] text-xs uppercase tracking-widest text-[#D4AF37]">
                <th className="px-4 py-3">Notice</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(notices ?? []).map((n, i) => {
                const st = statusBadge(n.status)
                const sev = severityBadge(n.severity)
                return (
                  <tr
                    key={n.id}
                    className={i % 2 === 0 ? 'bg-[#0a0a0f]' : 'bg-[#12121a]'}
                  >
                    <td className="px-4 py-3">
                      <p className="text-white">{n.title}</p>
                      <p className="line-clamp-1 text-xs text-[#5a5a78]">{n.body}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge level={st.level} label={st.label} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge level={sev.level} label={sev.label} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#a0a0b8]">
                      {n.targetScope}
                      {n.targetValue ? `=${n.targetValue}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#a0a0b8]">
                      {n.sentAt
                        ? `Sent ${formatDistanceToNow(new Date(n.sentAt), { addSuffix: true })}`
                        : n.scheduledFor
                          ? `Due ${format(new Date(n.scheduledFor), 'PPp')}`
                          : `Created ${formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {(n.status === 'DRAFT' || n.status === 'SCHEDULED') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(n.id, 'send-now', 'Sent')}
                            aria-label={`Send now: ${n.title}`}
                            className="text-xs text-[#D4AF37] underline disabled:opacity-50"
                          >
                            Send now
                          </button>
                        )}
                        {(n.status === 'DRAFT' || n.status === 'SCHEDULED') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(n.id, 'cancel', 'Cancelled')}
                            aria-label={`Cancel: ${n.title}`}
                            className="text-xs text-[#a0a0b8] underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!isLoading && (notices?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5a5a78]">
                    No notices yet — compose one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="flex flex-col gap-3 p-3 md:hidden">
          {(notices ?? []).map((n) => {
            const st = statusBadge(n.status)
            const sev = severityBadge(n.severity)
            return (
              <div
                key={n.id}
                className="rounded-lg border border-[#2a2a3f] bg-[#12121a] p-3"
              >
                <p className="text-sm text-white">{n.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-[#5a5a78]">{n.body}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge level={st.level} label={st.label} />
                  <StatusBadge level={sev.level} label={sev.label} />
                </div>
                <p className="mt-2 font-mono text-xs text-[#5a5a78]">
                  {n.targetScope}
                  {n.targetValue ? `=${n.targetValue}` : ''}
                </p>
                {(n.status === 'DRAFT' || n.status === 'SCHEDULED') && (
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(n.id, 'send-now', 'Sent')}
                      aria-label={`Send now: ${n.title}`}
                      className="text-xs text-[#D4AF37] underline"
                    >
                      Send now
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(n.id, 'cancel', 'Cancelled')}
                      aria-label={`Cancel: ${n.title}`}
                      className="text-xs text-[#a0a0b8] underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {!isLoading && (notices?.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-[#5a5a78]">No notices yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
