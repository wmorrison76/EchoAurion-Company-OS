'use client'

import { useMemo, useState } from 'react'
import { KPICard } from '@/components/ui/KPICard'
import { AuditLogRow } from '@/components/ui/AuditLogRow'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { AuditEntry } from '@/types/dr-os'

interface AuditTrailPanelProps {
  entries?: AuditEntry[]
  error?: string
}

type AuditFilter = 'all' | 'knights' | 'computer' | 'relay'

const FILTERS: { id: AuditFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: 'Every actor' },
  { id: 'knights', label: 'Knights', hint: 'help_desk.knights / board-room' },
  { id: 'computer', label: 'Computer', hint: 'computer_agent only' },
  { id: 'relay', label: 'Relay', hint: 'relay / support.question / outbox' },
]

function matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
  if (filter === 'all') return true
  const action = entry.action.toLowerCase()
  if (filter === 'computer') return entry.actor === 'computer_agent'
  if (filter === 'knights') {
    return (
      action.includes('knights') ||
      action.includes('board') ||
      action.includes('knight') ||
      action.startsWith('help_desk.knights') ||
      action.includes('briefing')
    )
  }
  // relay
  return (
    action.includes('relay') ||
    action.startsWith('support.') ||
    action.includes('outbox') ||
    action.includes('heartbeat') ||
    action.includes('client.send') ||
    action.includes('echo_repair') ||
    action.includes('live_repair')
  )
}

export function AuditTrailPanel({ entries, error }: AuditTrailPanelProps) {
  const [filter, setFilter] = useState<AuditFilter>('all')

  const filtered = useMemo(() => {
    if (!entries) return []
    return entries.filter((e) => matchesFilter(e, filter))
  }, [entries, filter])

  if (!entries && !error) return <SkeletonCard />

  return (
    <KPICard title="Audit Trail" className="sm:col-span-2 xl:col-span-3">
      {error ? (
        <p className="text-sm text-[#a0a0b8]">Error: {error}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#a0a0b8]">
              Tap a row to expand — full action, entityId, redacted payload.
              Shape+label actors: ✓ William · ⚠ Computer.
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter audit trail"
            >
              {FILTERS.map((f) => {
                const active = filter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={active}
                    aria-label={`Filter: ${f.label} — ${f.hint}`}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 ${
                      active
                        ? 'border-[#D4AF37] bg-[#1a1a26] text-[#D4AF37]'
                        : 'border-[#2a2a3f] text-[#a0a0b8] hover:border-[#D4AF37]'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {entries && entries.length > 0 ? (
            filtered.length > 0 ? (
              <ul className="overflow-hidden rounded-lg border border-[#2a2a3f]">
                {filtered.map((entry, i) => (
                  <AuditLogRow key={entry.id} entry={entry} striped={i % 2 === 0} />
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[#a0a0b8]">
                <StatusBadge level="unknown" label="No matches" />
                <span>No entries for this filter — try All.</span>
              </div>
            )
          ) : (
            <p className="text-sm text-[#a0a0b8]">No actions recorded yet</p>
          )}

          {entries && entries.length > 0 ? (
            <p className="mt-2 text-[10px] text-[#5a5a78]">
              Showing {filtered.length} of {entries.length} (last 50)
            </p>
          ) : null}
        </>
      )}
    </KPICard>
  )
}
