'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'

interface CohortRow {
  id: string
  subject: string
  moduleHint: string | null
  cohortBrowser: string | null
  cohortOs: string | null
  cohortAppVersion: string | null
  affectedCount: number
  occurrenceCount: number
  priority: string
  guestImpact: boolean
  updatedAt: string
}

async function fetcher(url: string): Promise<CohortRow[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<CohortRow[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

/**
 * Lite UI for cohort notify lists — “Safari 17 broke print BEO”.
 * Floor-safe messages only (no stacks).
 */
export function CohortMessagingPanel() {
  const { data, error, mutate, isLoading } = useSWR(
    '/api/help-desk/cohort-notify',
    fetcher,
    { refreshInterval: 60_000 }
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const selected = useMemo(
    () => data?.find((r) => r.id === selectedId) ?? null,
    [data, selectedId]
  )

  async function send() {
    if (!selectedId || !body.trim()) return
    setBusy(true)
    setFlash(null)
    try {
      const res = await fetch('/api/help-desk/cohort-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedId,
          title: title.trim() || undefined,
          body: body.trim(),
          severity: 'warning',
        }),
      })
      const json = (await res.json()) as APIResponse<{ notified: number }>
      if (!json.success) throw new Error(json.error)
      setFlash(`✓ Sent to ${json.data.notified} pilot(s)`)
      setBody('')
      await mutate()
    } catch (e) {
      setFlash(`✕ ${e instanceof Error ? e.message : 'Send failed'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4"
      aria-label="Cohort messaging"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Cohort messaging</p>
          <p className="mt-1 text-[11px] text-[#a0a0b8]">
            Device-class notify lists (e.g. Safari 17 · print BEO). Floor copy only — no stacks.
          </p>
        </div>
        <StatusBadge
          level={data && data.length > 0 ? 'warn' : 'ok'}
          label={data && data.length > 0 ? '▣ Open cohorts' : '✓ No open cohorts'}
          count={data?.length}
        />
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : isLoading && !data ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-[#1a1a26]" />
      ) : !data || data.length === 0 ? (
        <p className="mt-3 text-sm text-[#a0a0b8]">
          No open COHORT tickets. Promote a SYSTEM ticket to COHORT when a browser/OS/module slice
          is affected.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {data.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(row.id)
                    setTitle(
                      [row.cohortBrowser, row.cohortOs, row.moduleHint]
                        .filter(Boolean)
                        .join(' · ') || row.subject.replace(/^\[SYSTEM\]\s*/i, '').slice(0, 80)
                    )
                    setFlash(null)
                  }}
                  aria-label={`Select cohort ticket ${row.subject}`}
                  aria-current={selectedId === row.id ? 'true' : undefined}
                  className={`w-full rounded-lg border p-3 text-left transition-colors duration-150 ${
                    selectedId === row.id
                      ? 'border-[#D4AF37] bg-[#1a1a26]'
                      : 'border-[#2a2a3f] bg-[#0a0a0f] hover:border-[#3a3a55]'
                  }`}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge level="warn" label="▣ COHORT" />
                    {row.guestImpact ? (
                      <StatusBadge level="error" label="▲ Guest impact" />
                    ) : null}
                    <StatusBadge level="unknown" label={`Priority ${row.priority}`} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-white">{row.subject}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                    {row.affectedCount} keys · ×{row.occurrenceCount}
                    {row.moduleHint ? ` · ${row.moduleHint}` : ''} ·{' '}
                    {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3">
            {selected ? (
              <>
                <p className="text-[11px] text-[#a0a0b8]">
                  Target:{' '}
                  <span className="font-mono text-white">
                    {[selected.cohortBrowser, selected.cohortOs, selected.cohortAppVersion]
                      .filter(Boolean)
                      .join(' / ') || 'affected keys'}
                  </span>
                </p>
                <label className="flex flex-col text-[11px] text-[#5a5a78]">
                  Title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    aria-label="Cohort message title"
                    className="mt-1 rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col text-[11px] text-[#5a5a78]">
                  Floor message (no stacks)
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder="Safari 17 on iPad may fail print BEO — use PDF export until refresh ships."
                    aria-label="Cohort floor message"
                    className="mt-1 rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-xs text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || !body.trim()}
                  aria-label="Send cohort message"
                  className="self-start rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-[#D4AF37] hover:bg-[#22223a] disabled:opacity-40"
                >
                  {busy ? 'Sending…' : 'Send to cohort'}
                </button>
                {flash ? <p className="text-xs text-[#a0a0b8]">{flash}</p> : null}
              </>
            ) : (
              <p className="text-sm text-[#a0a0b8]">Select a cohort ticket to compose a notify.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
