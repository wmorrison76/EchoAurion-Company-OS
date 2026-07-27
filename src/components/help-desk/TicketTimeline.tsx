'use client'

import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TIMELINE_LABEL, type TimelineKind } from '@/lib/help-timeline-types'
import type { APIResponse } from '@/types'

interface TimelineEventView {
  id: string
  kind: TimelineKind
  label: string
  detail: string | null
  visibleToCustomer: boolean
  createdAt: string
}

async function fetcher(url: string): Promise<TimelineEventView[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<TimelineEventView[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const ORDER: TimelineKind[] = [
  'received',
  'drafting',
  'quoted',
  'agreement_signed',
  'shipping',
  'done',
]

/** Customer-visible timeline on Help Ticket detail. */
export function TicketTimeline({ ticketId }: { ticketId: string }) {
  const { data, error, mutate } = useSWR(
    `/api/help-desk/tickets/${ticketId}/timeline`,
    fetcher,
    { refreshInterval: 30_000 }
  )

  const present = new Set((data ?? []).map((e) => e.kind))

  return (
    <div className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Customer timeline</p>
        <button
          type="button"
          onClick={() => void mutate()}
          className="text-[10px] text-[#5a5a78] underline"
          aria-label="Refresh timeline"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : null}
      <ol className="mt-3 space-y-2">
        {ORDER.map((kind) => {
          const hit = (data ?? []).filter((e) => e.kind === kind)
          const done = present.has(kind)
          return (
            <li key={kind} className="flex items-start gap-2 text-xs">
              <StatusBadge
                level={done ? 'ok' : 'unknown'}
                label={done ? TIMELINE_LABEL[kind] : `Pending · ${TIMELINE_LABEL[kind]}`}
              />
              <div className="min-w-0 text-[#a0a0b8]">
                {hit.length === 0 ? (
                  <span className="text-[#5a5a78]">—</span>
                ) : (
                  hit.map((e) => (
                    <p key={e.id} className="truncate">
                      {e.detail ?? e.label}{' '}
                      <span className="font-mono text-[10px] text-[#5a5a78]">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </p>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
