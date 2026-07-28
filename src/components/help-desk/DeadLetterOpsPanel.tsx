'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'

interface DeadLetterPayload {
  ingestJobs: Array<{
    id: string
    kind: string
    attempts: number
    lastError: string | null
    updatedAt: string
    shape: string
    label: string
  }>
  stuckOutbox: Array<{
    id: string
    clientKey: string
    type: string
    createdAt: string
    ageMinutes: number
    shape: string
    label: string
  }>
  counts: { failedIngest: number; stuckOutbox: number }
}

async function fetcher(url: string): Promise<DeadLetterPayload> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<DeadLetterPayload>
  if (!body.success) throw new Error(body.error)
  return body.data
}

/** Operator panel: failed ingest jobs + stuck relay outbox with retry. */
export function DeadLetterOpsPanel() {
  const { data, error, mutate, isLoading } = useSWR('/api/help-desk/dead-letter', fetcher, {
    refreshInterval: 30_000,
  })
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function retry(
    action: 'requeue_ingest' | 'republish_outbox' | 'mark_outbox_delivered' | 'ack_all_stuck_outbox',
    id?: string
  ) {
    setBusy(true)
    setActionError(null)
    setActionMsg(null)
    try {
      const res = await fetch('/api/help-desk/dead-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { action, id } : { action }),
      })
      const body = (await res.json()) as APIResponse<{ count?: number }>
      if (!body.success) throw new Error(body.error)
      if (action === 'ack_all_stuck_outbox') {
        setActionMsg(`✓ Cleared ${body.data.count ?? 0} stuck outbox rows`)
      } else if (action === 'mark_outbox_delivered') {
        setActionMsg('✓ Acked — removed from stuck queue')
      } else if (action === 'republish_outbox') {
        setActionMsg('✓ Republished (stale row acked)')
      } else {
        setActionMsg('✓ Re-queued ingest job')
      }
      await mutate()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Dead letter and stuck outbox"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Delivery ops
        </h2>
        <div className="flex items-center gap-3">
          {data && data.counts.stuckOutbox > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void retry('ack_all_stuck_outbox')}
              className="rounded border border-[#D4AF37] px-2 py-0.5 text-[10px] text-[#D4AF37] disabled:opacity-50"
              aria-label="Acknowledge all stuck outbox rows"
            >
              {busy ? '…' : `Ack all ${data.counts.stuckOutbox}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void mutate()}
            className="text-[10px] text-[#5a5a78] underline"
            aria-label="Refresh dead letter panel"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : null}
      {error ? (
        <p className="mt-3 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : null}
      {actionError ? (
        <p className="mt-2 text-xs text-[#a0a0b8]" role="alert">
          <span aria-label="Error">✕</span> {actionError}
        </p>
      ) : null}
      {actionMsg ? (
        <p className="mt-2 text-xs text-[#a0a0b8]" role="status">
          {actionMsg}
        </p>
      ) : null}

      {data ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              level={data.counts.failedIngest > 0 ? 'error' : 'ok'}
              label={`✕ Failed ingest: ${data.counts.failedIngest}`}
            />
            <StatusBadge
              level={data.counts.stuckOutbox > 0 ? 'warn' : 'ok'}
              label={`▲ Stuck outbox: ${data.counts.stuckOutbox}`}
            />
          </div>

          {data.ingestJobs.length > 0 ? (
            <ul className="max-h-36 space-y-2 overflow-y-auto text-[11px]">
              {data.ingestJobs.slice(0, 8).map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5"
                >
                  <span className="font-mono text-[#a0a0b8]">
                    {j.shape} {j.kind} · ×{j.attempts} · {j.lastError?.slice(0, 48) ?? '—'}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[#D4AF37] underline disabled:opacity-50"
                    aria-label={`Re-queue ingest job ${j.id}`}
                    onClick={() => void retry('requeue_ingest', j.id)}
                  >
                    Retry
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[#5a5a78]">
              <span aria-label="Healthy">✓</span> No failed ingest jobs
            </p>
          )}

          {data.stuckOutbox.length > 0 ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto text-[11px]">
              {data.stuckOutbox.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5"
                >
                  <span className="font-mono text-[#a0a0b8]">
                    {o.shape} {o.type} · {o.clientKey.slice(0, 16)} · {o.ageMinutes}m
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[#D4AF37] underline disabled:opacity-50"
                      aria-label={`Republish outbox ${o.id}`}
                      onClick={() => void retry('republish_outbox', o.id)}
                    >
                      Republish
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[#a0a0b8] underline disabled:opacity-50"
                      aria-label={`Mark outbox ${o.id} delivered`}
                      onClick={() => void retry('mark_outbox_delivered', o.id)}
                    >
                      Ack
                    </button>
                  </span>
                </li>
              ))}
              {data.counts.stuckOutbox > data.stuckOutbox.length ? (
                <li className="text-[10px] text-[#5a5a78]">
                  Showing {data.stuckOutbox.length} of {data.counts.stuckOutbox} — use Ack all
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
