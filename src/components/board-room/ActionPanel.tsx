'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  ACTION_STATUS_LABEL,
  ACTION_TYPE_LABEL,
  type BoardActionDTO,
  type BoardActionStatus,
} from '@/types/board-room'
import type { APIResponse } from '@/types'
import type { StatusLevel } from '@/types'

const STATUS_LEVEL: Record<BoardActionStatus, StatusLevel> = {
  PROPOSED: 'unknown',
  APPROVED: 'warn',
  EXECUTED: 'ok',
  DISMISSED: 'unknown',
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const btn =
  'rounded-lg border px-3 py-1 text-xs font-medium transition-colors duration-150 disabled:opacity-50'

export function ActionPanel({ sessionId, synthesis }: { sessionId: string; synthesis: string | null }) {
  const { data, mutate, isLoading } = useSWR(
    `/api/board-room/sessions/${sessionId}/actions`,
    jsonFetcher<BoardActionDTO[]>,
    { revalidateOnFocus: false }
  )
  const [busy, setBusy] = useState(false)
  const [architect, setArchitect] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setBusy(true)
    try {
      await fetch(`/api/board-room/sessions/${sessionId}/actions`, { method: 'POST' })
      await mutate()
    } finally {
      setBusy(false)
    }
  }, [sessionId, mutate])

  const op = useCallback(
    async (id: string, action: 'approve' | 'execute' | 'dismiss') => {
      await fetch(`/api/board-room/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: action }),
      })
      await mutate()
    },
    [mutate]
  )

  const handToArchitect = useCallback(async () => {
    if (!synthesis) return
    setArchitect('Dispatching…')
    const res = await fetch('/api/board-room/architect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: synthesis }),
    })
    const body = (await res.json()) as APIResponse<{ dispatched: boolean; detail: string }>
    setArchitect(body.success ? body.data.detail : body.error)
  }, [synthesis])

  const actions = data ?? []

  return (
    <KPICard title="Action Layer">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={busy || actions.length > 0}
            className={`${btn} border-[#D4AF37] text-[#D4AF37] hover:bg-[#1a1a26]`}
            aria-label="Generate proposed actions from the synthesis"
          >
            {actions.length > 0 ? 'Actions generated' : busy ? 'Generating…' : 'Generate actions'}
          </button>
          <button
            type="button"
            onClick={handToArchitect}
            disabled={!synthesis}
            className={`${btn} border-[#2a2a3f] text-[#a0a0b8] hover:bg-[#1a1a26]`}
            aria-label="Hand the plan to the Architect (Claude Code)"
          >
            Hand to Architect
          </button>
          {architect ? <span className="text-xs text-[#5a5a78]">{architect}</span> : null}
        </div>
        <p className="text-[11px] text-[#5a5a78]">
          Approve → Execute. Execute prepares a draft and records it — nothing is sent or booked
          automatically.
        </p>

        {isLoading ? (
          <p className="text-sm text-[#a0a0b8]">Loading actions…</p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-[#a0a0b8]">No actions yet — generate them from the plan.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[#2a2a3f] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#a0a0b8]">
                        {ACTION_TYPE_LABEL[a.type]}
                      </span>
                      <p className="truncate text-sm font-medium text-white">{a.title}</p>
                    </div>
                    {a.summary ? (
                      <p className="mt-1 text-xs text-[#a0a0b8]">{a.summary}</p>
                    ) : null}
                    {a.result?.note ? (
                      <p className="mt-1 text-[11px] text-[#5a5a78]">↳ {String(a.result.note)}</p>
                    ) : null}
                  </div>
                  <StatusBadge level={STATUS_LEVEL[a.status]} label={ACTION_STATUS_LABEL[a.status]} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {a.status === 'PROPOSED' ? (
                    <button
                      type="button"
                      onClick={() => op(a.id, 'approve')}
                      className={`${btn} border-[#D4AF37] text-[#D4AF37] hover:bg-[#1a1a26]`}
                    >
                      Approve
                    </button>
                  ) : null}
                  {a.status === 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => op(a.id, 'execute')}
                      className={`${btn} border-[#22c55e] text-[#22c55e] hover:bg-[#1a1a26]`}
                    >
                      Execute (draft)
                    </button>
                  ) : null}
                  {a.status === 'PROPOSED' || a.status === 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => op(a.id, 'dismiss')}
                      className={`${btn} border-[#2a2a3f] text-[#a0a0b8] hover:bg-[#1a1a26]`}
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </KPICard>
  )
}
