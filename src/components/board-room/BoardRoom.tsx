'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { knightLabel, knightLevel, sessionLabel, sessionLevel } from '@/lib/board-room/status'
import type { APIResponse } from '@/types'
import type {
  BoardRoomSessionDTO,
  BoardRoomSessionSummary,
  Seat,
} from '@/types/board-room'

interface RosterSeat {
  seat: Seat
  name: string
  model: string
  role: string
  configured: boolean
  hasDbAccess: boolean
  conductor: boolean
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function BoardRoom() {
  const roster = useSWR('/api/board-room/roster', jsonFetcher<RosterSeat[]>, {
    revalidateOnFocus: false,
  })
  const sessions = useSWR('/api/board-room/sessions', jsonFetcher<BoardRoomSessionSummary[]>, {
    revalidateOnFocus: false,
  })

  const [problem, setProblem] = useState('')
  const [sandbox, setSandbox] = useState(false)
  const [convening, setConvening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<BoardRoomSessionDTO | null>(null)

  const openSession = useCallback(async (id: string) => {
    setActive(null)
    const data = await jsonFetcher<BoardRoomSessionDTO>(`/api/board-room/sessions/${id}`)
    setActive(data)
  }, [])

  const convene = useCallback(async () => {
    setConvening(true)
    setError(null)
    try {
      const res = await fetch('/api/board-room/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, sandbox }),
      })
      const body = (await res.json()) as APIResponse<{ id: string }>
      if (!body.success) throw new Error(body.error)
      setProblem('')
      await openSession(body.data.id)
      sessions.mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convene the Board')
    } finally {
      setConvening(false)
    }
  }, [problem, sandbox, openSession, sessions])

  return (
    <div className="flex flex-col gap-6">
      {/* Convene form */}
      <KPICard title="Convene the Board">
        <div className="flex flex-col gap-3">
          <label htmlFor="problem" className="sr-only">
            Problem statement
          </label>
          <textarea
            id="problem"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={3}
            placeholder="Drop a problem into the room — e.g. “Brunch food cost is at 38%, target 28%.”"
            aria-label="Problem statement for the Board Room"
            className="w-full resize-y rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-4 py-3 text-sm text-white outline-none transition-colors duration-150 focus:border-[#D4AF37]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-[#a0a0b8]">
              <input
                type="checkbox"
                checked={sandbox}
                onChange={(e) => setSandbox(e.target.checked)}
                aria-label="Playground mode — sandbox session never writes to production"
                className="h-4 w-4 accent-[#D4AF37]"
              />
              Playground (sandbox — never writes to production data)
            </label>
            <button
              type="button"
              onClick={convene}
              disabled={convening || problem.trim().length < 8}
              aria-label="Convene the Board"
              className="rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:opacity-50"
            >
              {convening ? 'Convening…' : 'Convene the Board'}
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-white">
              <span aria-hidden="true">✕</span> {error}
            </p>
          ) : null}
        </div>
      </KPICard>

      {/* Roster */}
      <section>
        <h3 className="mb-3 text-xs uppercase tracking-widest text-[#D4AF37]">The Knights</h3>
        {roster.error ? (
          <p className="text-sm text-[#a0a0b8]">Roster unavailable: {String(roster.error)}</p>
        ) : !roster.data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {roster.data.map((k) => (
              <div
                key={k.seat}
                className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{k.name}</p>
                    <p className="font-mono text-xs text-[#5a5a78]">{k.model}</p>
                  </div>
                  <StatusBadge
                    level={k.configured ? 'ok' : 'unknown'}
                    label={k.configured ? 'Active' : 'Unavailable'}
                  />
                </div>
                <p className="text-xs text-[#a0a0b8]">{k.role}</p>
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-[#5a5a78]">
                  {k.conductor ? <span className="text-[#D4AF37]">Conductor</span> : null}
                  {k.hasDbAccess ? <span>DB access</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active session */}
      {active ? <SessionView session={active} /> : null}

      {/* History */}
      <section>
        <h3 className="mb-3 text-xs uppercase tracking-widest text-[#D4AF37]">Sessions</h3>
        {!sessions.data ? (
          <SkeletonCard />
        ) : sessions.data.length === 0 ? (
          <p className="text-sm text-[#a0a0b8]">No sessions yet — convene the Board above.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-[#2a2a3f]">
            {sessions.data.map((s, i) => (
              <li key={s.id} className={i % 2 === 0 ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'}>
                <button
                  type="button"
                  onClick={() => openSession(s.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[#22223a]"
                  aria-label={`Open session: ${s.problem}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{s.problem}</p>
                    <p className="text-xs text-[#5a5a78]">
                      {s.respondedCount}/{s.knightCount} knights ·{' '}
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                      {s.sandbox ? ' · sandbox' : ''}
                    </p>
                  </div>
                  <StatusBadge level={sessionLevel(s.status)} label={sessionLabel(s.status)} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SessionView({ session }: { session: BoardRoomSessionDTO }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-[#D4AF37]">Session</h3>
          <p className="mt-1 text-sm text-white">{session.problem}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {session.sandbox ? <StatusBadge level="warn" label="Sandbox" /> : null}
          <StatusBadge level={sessionLevel(session.status)} label={sessionLabel(session.status)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {session.responses.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-white">{r.name}</p>
                <p className="font-mono text-xs text-[#5a5a78]">
                  {r.model}
                  {r.latencyMs !== null ? ` · ${r.latencyMs}ms` : ''}
                </p>
              </div>
              <StatusBadge level={knightLevel(r.status)} label={knightLabel(r.status)} />
            </div>
            <p className="whitespace-pre-wrap text-sm text-[#a0a0b8]">
              {r.content ?? r.error ?? '—'}
            </p>
          </div>
        ))}
      </div>

      <KPICard title="Maestro Synthesis">
        <p className="whitespace-pre-wrap text-sm text-[#a0a0b8]">
          {session.synthesis ?? 'Awaiting synthesis…'}
        </p>
      </KPICard>
    </section>
  )
}
