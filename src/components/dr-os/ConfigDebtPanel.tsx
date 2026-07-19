'use client'

import { useState } from 'react'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { ConfigDebtHealth } from '@/types/dr-os'
import type { APIResponse } from '@/types'

/**
 * Env/config gaps on Dr. OS — not the exception flywheel.
 * Knights do not set Render secrets. With RENDER_API_KEY on Company OS,
 * William (or computer_agent via CRON_SECRET) can apply allowlisted vars
 * through POST /api/dr-os/render-config — key never enters Round Table prompts.
 */
export function ConfigDebtPanel({
  data,
  onApplied,
}: {
  data?: ConfigDebtHealth
  onApplied?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  if (!data) return <SkeletonCard />

  const count = data.items.length
  const level = count === 0 ? 'ok' : 'warn'
  const label = count === 0 ? 'Clear' : `${count} to paste`
  const showApplyEcho = data.echoAiUrlDebt

  async function applyEchoAiUrl() {
    setBusy(true)
    setActionMsg(null)
    setActionErr(null)
    try {
      const res = await fetch('/api/dr-os/render-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: 'echo_ai_url', redeploy: true }),
      })
      const body = (await res.json()) as APIResponse<{
        label: string
        keysSet: string[]
        deployId: string | null
      }>
      if (!body.success) {
        setActionErr(body.error)
        return
      }
      setActionMsg(
        `${body.data.label}${body.data.deployId ? ` · deploy ${body.data.deployId.slice(0, 8)}…` : ''}`
      )
      onApplied?.()
    } catch {
      setActionErr('Connection error applying Render config')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KPICard
      title="Config debt"
      badge={<StatusBadge level={level} label={label} count={count || undefined} />}
      className="sm:col-span-2 xl:col-span-3"
    >
      <p className="mb-2 text-xs text-[#a0a0b8]">
        These reds are missing Render env vars — not crashes. Knights cannot invent keys.
        Paste secrets on <span className="text-white">echoaurion-company-os</span> → Environment,
        or (with <span className="font-mono text-[11px]">RENDER_API_KEY</span> on Company OS)
        apply allowlisted vars via Render API.
      </p>
      {count === 0 ? (
        <p className="text-sm text-white">✓ No config debt — panel env vars present.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#2a2a3f]" aria-label="Config debt list">
          {data.items.map((item) => (
            <li key={item.panel} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">{item.panel}</span>
                <StatusBadge level="warn" label="Paste env" />
              </div>
              <p className="text-xs text-[#a0a0b8]">{item.reason}</p>
              <p className="font-mono text-[11px] text-[#D4AF37]">
                {item.envVars.join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}

      {showApplyEcho ? (
        <div className="mt-3 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3">
          <p className="mb-2 text-xs text-[#a0a0b8]">
            Chef&apos;s Brain URL checklist — server-side only (no key in tickets).
          </p>
          {data.renderApiConfigured ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyEchoAiUrl()}
              aria-label="Apply suggested ECHO_AI_URL via Render API"
              className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2 text-xs font-medium text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-50"
            >
              {busy ? 'Applying…' : 'Apply suggested ECHO_AI_URL via Render'}
            </button>
          ) : (
            <p className="text-xs text-white" role="status">
              <span aria-hidden="true">⚠ </span>
              set <span className="font-mono text-[#D4AF37]">RENDER_API_KEY</span> first — paste
              once on Company OS web Environment (William). Knights never receive this key.
            </p>
          )}
          {actionMsg ? (
            <p className="mt-2 text-xs text-white" role="status">
              <span aria-hidden="true">✓ </span>
              {actionMsg}
            </p>
          ) : null}
          {actionErr ? (
            <p className="mt-2 text-xs text-[#a0a0b8]" role="alert">
              <span aria-hidden="true">✕ </span>
              Error: {actionErr}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#5a5a78]">
        <span>Render API</span>
        {data.renderApiConfigured ? (
          <StatusBadge level="ok" label="Key present" />
        ) : (
          <StatusBadge level="unknown" label="Key missing" />
        )}
        <span>
          computer_agent / Perplexity use server or .env.local; Knights seats never get the key.
        </span>
      </div>

      {data.ticketId ? (
        <p className="mt-3 text-[11px] text-[#5a5a78]">
          Daily SYSTEM reminder (no Knights):{' '}
          <a
            href={`/help-desk?ticket=${data.ticketId}`}
            className="text-[#D4AF37] underline"
            aria-label="Open config debt Help Desk ticket"
          >
            ticket {data.ticketId.slice(0, 8)}…
          </a>
        </p>
      ) : null}
    </KPICard>
  )
}
