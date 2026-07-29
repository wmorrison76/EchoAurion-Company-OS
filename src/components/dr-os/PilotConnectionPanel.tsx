'use client'

import { useState } from 'react'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { PilotConnectionHealth } from '@/types/dr-os'
import type { APIResponse } from '@/types'

/** Fallback when API omits suggestedEchoAiUrl — keep in sync with src/lib/echo-brain.ts */
const FALLBACK_ECHO_AI_URL =
  'https://luccca-web.onrender.com/api/company-os/echo-brain'

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
  detail,
}: {
  ok: boolean
  label: string
  detail?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[#a0a0b8]">{label}</span>
        <StatusBadge level={ok ? 'ok' : 'error'} label={ok ? 'Yes' : 'No'} />
      </div>
      {detail && !ok ? (
        <p className="text-[10px] text-[#5a5a78]" role="status">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function PilotConnectionPanel({ data }: { data?: PilotConnectionHealth }) {
  const [snapBusy, setSnapBusy] = useState(false)
  const [snapMsg, setSnapMsg] = useState<string | null>(null)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  if (!data) return <SkeletonCard />

  const suggestedUrl = data.suggestedEchoAiUrl ?? FALLBACK_ECHO_AI_URL
  const showEchoHelp = !data.echoAiConfigured || !data.chefsBrainConfigured

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

  async function onCopyUrl() {
    const ok = await copyText(suggestedUrl)
    setCopyMsg(ok ? '✓ URL copied — paste into Render ECHO_AI_URL' : 'Copy failed — select the URL manually')
    window.setTimeout(() => setCopyMsg(null), 4000)
  }

  async function onCopyEnvBlock() {
    const block = [
      `ECHO_AI_URL=${suggestedUrl}`,
      'ECHO_AI_KEY=<same as luccca-web ECHO_BRAIN_SECRET or COMPANY_OS_INGEST_SECRET>',
    ].join('\n')
    const ok = await copyText(block)
    setCopyMsg(ok ? '✓ Env lines copied — paste into Render Environment' : 'Copy failed')
    window.setTimeout(() => setCopyMsg(null), 4000)
  }

  const relayLevel = data.relayLevel ?? data.level
  const relayLabel = data.relayLabel ?? data.label
  const brainLevel = data.brainLevel ?? (data.chefsBrainConfigured ? 'ok' : 'warn')
  const brainLabel =
    data.brainLabel ??
    (data.chefsBrainConfigured
      ? "Chef's Brain OK"
      : data.echoAiConfigured
        ? "Chef's Brain down"
        : "Chef's Brain unset")

  return (
    <KPICard
      title="Connection health"
      badge={<StatusBadge level={relayLevel} label={relayLabel} />}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge level={relayLevel} label={relayLabel} />
          <StatusBadge level={brainLevel} label={brainLabel} />
        </div>
        <p className="text-[10px] text-[#5a5a78]" role="note">
          Relay (heartbeat) and Chef&apos;s Brain are separate — unset Brain does not mean
          pilot offline.
        </p>
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
          <BoolRow
            ok={data.echoAiConfigured}
            label="ECHO_AI_URL"
            detail={
              data.echoAiConfigured
                ? undefined
                : 'Unset on Render — copy URL below (William paste; Knights cannot)'
            }
          />
          <BoolRow
            ok={data.chefsBrainConfigured}
            label="Chef's Brain"
            detail={
              data.chefsBrainConfigured
                ? undefined
                : data.chefsBrainDetail ?? 'Probe failed — check URL path on luccca-web'
            }
          />
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[#a0a0b8]">Echo panel watch</span>
            <StatusBadge
              level={data.echoPanelWatch?.level ?? 'unknown'}
              label={
                data.echoPanelWatch?.label ??
                (data.echoPanelWatch?.enabled ? 'Echo panel watch on' : 'Echo panel watch off')
              }
            />
          </div>
        </div>

        {showEchoHelp ? (
          <div
            className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-2.5"
            role="region"
            aria-label="How to turn Chef's Brain green"
          >
            <p className="text-[11px] font-medium text-[#D4AF37]">
              How to turn green
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] text-[#a0a0b8]">
              <li>
                Render → <span className="text-white">echoaurion-company-os</span> →
                Environment
              </li>
              <li>
                Set <code className="text-white">ECHO_AI_URL</code> to the URL below
                (click to copy)
              </li>
              <li>
                Set <code className="text-white">ECHO_AI_KEY</code> to luccca-web{' '}
                <code className="text-white">ECHO_BRAIN_SECRET</code> (or ingest
                secret)
                {data.echoAiKeyConfigured === false ? (
                  <span className="text-[#f59e0b]"> · ⚠ key not set yet</span>
                ) : null}
              </li>
              <li>Save → wait for redeploy → refresh Dr. OS</li>
            </ol>
            <div className="mt-2 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => void onCopyUrl()}
                aria-label="Copy suggested ECHO_AI_URL"
                className="break-all rounded border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-left font-mono text-[10px] text-[#D4AF37] hover:border-[#D4AF37]"
              >
                {suggestedUrl}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onCopyUrl()}
                  aria-label="Copy ECHO_AI_URL only"
                  className="rounded-lg border border-[#D4AF37] px-2.5 py-1 text-[11px] text-[#D4AF37]"
                >
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={() => void onCopyEnvBlock()}
                  aria-label="Copy ECHO_AI_URL and ECHO_AI_KEY template"
                  className="rounded-lg border border-[#2a2a3f] px-2.5 py-1 text-[11px] text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
                >
                  Copy env lines
                </button>
              </div>
              {copyMsg ? (
                <p className="text-[10px] text-[#a0a0b8]" role="status">
                  {copyMsg}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

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
              Chef&apos;s Brain:{' '}
              <code className="text-white">ECHO_AI_URL</code> →{' '}
              <code className="text-white">{suggestedUrl}</code>
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
