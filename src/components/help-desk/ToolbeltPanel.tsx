'use client'

import { useState } from 'react'
import { SAFE_TOOLS, type SafeTool, type ToolInvokeResult } from '@/lib/safe-tools-types'
import type { APIResponse } from '@/types'

/**
 * Allowlisted safe toolbelt for a Help Desk ticket.
 * Dry-run default; execute only when autonomy permits.
 */
export function ToolbeltPanel({
  clientKey,
  ticketId,
  workRequestId,
  compact = false,
}: {
  clientKey: string | null
  ticketId: string
  workRequestId: string | null
  /** When true, sit inside the Help Desk action dock (Approve + Dry-run together). */
  compact?: boolean
}) {
  const [tool, setTool] = useState<SafeTool>('show_message')
  const [dryRun, setDryRun] = useState(true)
  const [paramsJson, setParamsJson] = useState('{"title":"Help Desk","body":"Message from Dr. OS"}')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function invoke() {
    if (!clientKey) {
      setError('Ticket needs a clientKey')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      let params: Record<string, unknown> = {}
      try {
        params = JSON.parse(paramsJson) as Record<string, unknown>
      } catch {
        throw new Error('params must be valid JSON')
      }
      if (tool === 'open_pr' && workRequestId) {
        params.workRequestId = workRequestId
      }
      const res = await fetch('/api/tools/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool,
          clientKey,
          params,
          dryRun,
          ticketId,
          workRequestId: workRequestId ?? undefined,
        }),
      })
      const body = (await res.json()) as APIResponse<ToolInvokeResult>
      if (!body.success) throw new Error(body.error)
      setResult(body.data.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invoke failed')
    } finally {
      setBusy(false)
    }
  }

  async function openPrPlan() {
    if (!workRequestId) {
      setError('No WorkRequest linked — FEATURE tickets only')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/work/${workRequestId}/pr-plan`, { method: 'POST' })
      const body = (await res.json()) as APIResponse<{
        plan: { branchName: string; prTitle: string }
        github: { created: boolean; detail: string; url?: string }
      }>
      if (!body.success) throw new Error(body.error)
      setResult(
        `PR plan ${body.data.plan.branchName} · ${body.data.github.created ? body.data.github.url : body.data.github.detail}`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PR plan failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={
        compact
          ? 'rounded-lg border border-[#2a2a3f] bg-[#12121a] p-2'
          : 'rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
          {compact ? 'Safe tools · Dry-run here' : 'Safe toolbelt'}
        </p>
        <label className="flex items-center gap-1.5 rounded-full border border-[#2a2a3f] px-2 py-1 text-xs text-[#a0a0b8]">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            aria-label="Dry run — checked means no live client directive"
          />
          <span className={dryRun ? 'text-[#22c55e]' : 'text-[#f59e0b]'}>
            {dryRun ? '✓ Dry-run on' : '▲ Live execute'}
          </span>
        </label>
      </div>
      {!compact ? (
        <p className="mt-1 text-[11px] text-[#5a5a78]">
          Dry-run default · no RDP · execute needs standby/autopilot
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="toolbelt-tool">
          Tool
        </label>
        <select
          id="toolbelt-tool"
          value={tool}
          onChange={(e) => setTool(e.target.value as SafeTool)}
          aria-label="Select safe tool"
          className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5 text-xs text-white"
        >
          {SAFE_TOOLS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void invoke()}
          aria-label="Invoke safe tool"
          className="rounded-lg border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37] disabled:opacity-40"
        >
          {busy ? '…' : 'Invoke'}
        </button>
        {workRequestId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void openPrPlan()}
            aria-label="Open PR plan for work request"
            className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-40"
          >
            Open PR plan
          </button>
        ) : null}
      </div>
      <textarea
        value={paramsJson}
        onChange={(e) => setParamsJson(e.target.value)}
        rows={compact ? 1 : 2}
        aria-label="Tool params JSON"
        className="mt-2 w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5 font-mono text-[11px] text-white"
      />
      {error ? (
        <p className="mt-1 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error}
        </p>
      ) : null}
      {result ? <p className="mt-1 font-mono text-[11px] text-[#22c55e]">{result}</p> : null}
    </div>
  )
}
