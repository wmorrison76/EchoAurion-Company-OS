'use client'

import { useState } from 'react'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { PilotConnectionHealth } from '@/types/dr-os'
import type { APIResponse } from '@/types'

function formatAgeMs(ms: number | null): string {
  if (ms == null) return 'never'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

type SnapshotResponse = {
  id: string
  snapshot: { label: string; health: string }
}

function BoolRow({
  ok,
  label,
}: {
  ok: boolean
  label: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[#a0a0b8]">{label}</span>
      <StatusBadge level={ok ? 'ok' : 'error'} label={ok ? 'Yes' : 'No'} />
    </div>
  )
}

export function PilotConnectionPanel({ data }: { data?: PilotConnectionHealth }) {
  const [snapBusy, setSnapBusy] = useState(false)
  const [snapMsg, setSnapMsg] = useState<string | null>(null)

  if (!data) return <SkeletonCard />

  async function captureSnapshot(sendToKnights: boolean) {
    setSnapBusy(true)
    setSnapMsg(null)
    try {
      const res = await fetch('/api/support/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendToKnights }),
      })
      const body = (await res.json()) as APIResponse<SnapshotResponse>
      if (!body.success) throw new Error(body.error)
      setSnapMsg(
        sendToKnights
          ? `Snapshot ${body.data.id.slice(0, 8)}… → Knights sandbox`
          : `Snapshot ${body.data.id.slice(0, 8)}… saved (${body.data.snapshot.label})`
      )
    } catch (e) {
      setSnapMsg(e instanceof Error ? e.message : 'Snapshot failed')
    } finally {
      setSnapBusy(false)
    }
  }

  return (
    <KPICard
      title="Connection health"
      badge={<StatusBadge level={data.level} label={data.label} />}
    >
      <div className="flex flex-col gap-2">
        <p className="font-mono text-3xl font-semibold tabular-nums text-white">
          {data.onlineCount}
          <span className="text-lg text-[#5a5a78]"> / {data.totalClients}</span>
        </p>
        <p className="text-xs text-[#a0a0b8]">
          online · heartbeat {formatAgeMs(data.lastHeartbeatAgeMs)} · stream{' '}
          {data.streamCount} · outbox {data.pendingOutbox}
        </p>
        <p className="text-xs text-[#a0a0b8]">
          Last question {formatAgeMs(data.lastQuestionAgeMs)} · standby{' '}
          {data.standbyMode}
          {data.standbyReviewCount > 0
            ? ` · ⚠ ${data.standbyReviewCount} review`
            : ''}
        </p>

        <div className="mt-1 flex flex-col gap-1.5 border-t border-[#2a2a3f] pt-2">
          <BoolRow
            ok={data.supportIngestSecretConfigured}
            label="SUPPORT_INGEST_SECRET"
          />
          <BoolRow ok={data.emailConfigured} label="emailConfigured" />
          <BoolRow ok={data.echoAiConfigured} label="ECHO_AI_URL" />
          <BoolRow ok={data.chefsBrainConfigured} label="Chef's Brain" />
        </div>

        {!data.supportIngestSecretConfigured ? (
          <p className="text-xs text-[#f59e0b]" role="status">
            ⚠ Set SUPPORT_INGEST_SECRET on Render (same value as luccca-web
            COMPANY_OS_INGEST_SECRET). See connect doc below.
          </p>
        ) : null}

        {data.error ? <p className="text-xs text-[#5a5a78]">{data.error}</p> : null}

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={snapBusy}
            aria-label="Capture system snapshot"
            onClick={() => void captureSnapshot(false)}
            className="rounded-lg border border-[#D4AF37] px-2.5 py-1.5 text-[11px] text-[#D4AF37] disabled:opacity-40"
          >
            {snapBusy ? 'Capturing…' : 'Capture system snapshot'}
          </button>
          <button
            type="button"
            disabled={snapBusy}
            aria-label="Capture snapshot and send to Knights sandbox"
            onClick={() => void captureSnapshot(true)}
            className="rounded-lg border border-[#2a2a3f] px-2.5 py-1.5 text-[11px] text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-40"
          >
            Send to Knights
          </button>
        </div>
        {snapMsg ? (
          <p className="text-[11px] text-[#a0a0b8]" role="status">
            {snapMsg}
          </p>
        ) : null}

        <details className="mt-1 text-xs text-[#a0a0b8]">
          <summary className="cursor-pointer text-[#D4AF37]">
            Connect pilot summary
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              Generate secret: <code className="text-white">openssl rand -hex 32</code>
            </li>
            <li>
              Company OS Render: <code className="text-white">SUPPORT_INGEST_SECRET</code>
            </li>
            <li>
              luccca-web: <code className="text-white">COMPANY_OS_INGEST_SECRET</code>{' '}
              (identical)
            </li>
            <li>
              Optional: <code className="text-white">ECHO_AI_URL</code> → luccca-web
              /api/company-os/echo-brain
            </li>
          </ol>
          <a
            href="/support/pilot-links"
            className="mt-2 inline-block text-[#D4AF37] underline"
            aria-label="Open Pilot links connection hub"
          >
            Pilot links →
          </a>
          <p className="mt-1 text-[10px] text-[#5a5a78]">
            Full steps: docs/CONNECT_PILOT_TO_COMPANY_OS.md
          </p>
        </details>
      </div>
    </KPICard>
  )
}
