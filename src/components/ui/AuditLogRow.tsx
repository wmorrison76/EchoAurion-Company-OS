'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { actorLabel } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { AuditEntry } from '@/types/dr-os'

interface AuditLogRowProps {
  entry: AuditEntry
  /** Zebra striping (CLAUDE.md §4.3). */
  striped?: boolean
}

function actorBadge(actor: string): { level: 'ok' | 'warn' | 'unknown'; label: string } {
  if (actor === 'william_morrison') return { level: 'ok', label: 'William' }
  if (actor === 'computer_agent') return { level: 'warn', label: 'Computer' }
  return { level: 'unknown', label: actorLabel(actor) }
}

function formatPayload(payload: unknown): string {
  if (payload == null) return '(no payload)'
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export function AuditLogRow({ entry, striped }: AuditLogRowProps) {
  const [open, setOpen] = useState(false)
  const when = formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })
  const badge = actorBadge(entry.actor)
  const hasPayload = entry.payload != null

  return (
    <li
      className={`${striped ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} audit entry ${entry.action}`}
        className="grid w-full grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm hover:bg-[#1a1a26] sm:grid-cols-[7rem_auto_1fr_auto]"
      >
        <span className="font-mono text-xs text-[#5a5a78] tabular-nums">{when}</span>
        <StatusBadge level={badge.level} label={badge.label} className="justify-self-start" />
        <span className="col-span-2 truncate text-[#a0a0b8] sm:col-span-1">
          <span className="font-mono text-white">{entry.action}</span>
          {entry.entityId ? (
            <span className="ml-2 text-[#5a5a78]">{entry.entityId}</span>
          ) : null}
        </span>
        <span
          className="hidden text-[10px] text-[#5a5a78] sm:inline"
          aria-hidden="true"
        >
          {open ? '▾ details' : '▸ details'}
        </span>
      </button>
      {open ? (
        <div
          className="border-t border-[#2a2a3f] px-3 py-2 text-xs"
          role="region"
          aria-label={`Audit details for ${entry.action}`}
        >
          <dl className="grid gap-1.5 sm:grid-cols-[6rem_1fr]">
            <dt className="text-[#5a5a78]">Actor</dt>
            <dd className="font-mono text-[#a0a0b8]">
              {entry.actor} ({badge.label})
            </dd>
            <dt className="text-[#5a5a78]">Action</dt>
            <dd className="break-all font-mono text-white">{entry.action}</dd>
            <dt className="text-[#5a5a78]">Entity</dt>
            <dd className="break-all font-mono text-[#a0a0b8]">
              {entry.entityId ?? '—'}
            </dd>
            <dt className="text-[#5a5a78]">When</dt>
            <dd className="font-mono text-[#a0a0b8]">
              {new Date(entry.createdAt).toISOString()} · {when}
            </dd>
            <dt className="text-[#5a5a78]">Payload</dt>
            <dd>
              {hasPayload ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-[#2a2a3f] bg-[#0a0a0f] p-2 font-mono text-[10px] text-[#a0a0b8]">
                  {formatPayload(entry.payload)}
                </pre>
              ) : (
                <span className="text-[#5a5a78]">(empty · redacted secrets stripped server-side)</span>
              )}
            </dd>
          </dl>
        </div>
      ) : null}
    </li>
  )
}
