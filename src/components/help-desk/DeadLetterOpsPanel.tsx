'use client'

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

  async function retry(
    action: 'requeue_ingest' | 'republish_outbox' | 'mark_outbox_delivered',
    id: string
  ) {
    const res = await fetch('/api/help-desk/dead-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    })
    const body = (await res.json()) as APIResponse<unknown>
    if (!body.success) throw new Error(body.error)
    await mutate()
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
        <button
          type="button"
          onClick={() => void mutate()}
          className="text-[10px] text-[#5a5a78] underline"
          aria-label="Refresh dead letter panel"
        >
          Refresh
        </button>
      </div>

      {isLoading && !data ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : null}
      {error ? (
        <p className="mt-3 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
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
                    className="text-[#D4AF37] underline"
                    aria-label={`Re-queue ingest job ${j.id}`}
                    onClick={() => void retry('requeue_ingest', j.id).catch(() => {})}
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
            <ul className="max-h-36 space-y-2 overflow-y-auto text-[11px]">
              {data.stuckOutbox.slice(0, 8).map((o) => (
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
                      className="text-[#D4AF37] underline"
                      aria-label={`Republish outbox ${o.id}`}
                      onClick={() => void retry('republish_outbox', o.id).catch(() => {})}
                    >
                      Republish
                    </button>
                    <button
                      type="button"
                      className="text-[#5a5a78] underline"
                      aria-label={`Mark outbox ${o.id} delivered`}
                      onClick={() => void retry('mark_outbox_delivered', o.id).catch(() => {})}
                    >
                      Ack
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
