'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SAFE_TOOLS, type SafeTool } from '@/lib/safe-tools-types'
import { LAB_ECHO_CHROME_CLIENT_KEY } from '@/lib/lab-echo-chrome'
import { AUTONOMY_DIALS, AUTONOMY_LABEL, type AutonomyDial } from '@/lib/autonomy-types'
import type { APIResponse } from '@/types'
import type { EliteReadinessPayload } from '@/app/api/lab/elite/status/route'
import type { EvalRunSummary } from '@/lib/help-eval'
import type { AutonomyConfig } from '@/lib/autonomy'
import type { ToolInvokeResult } from '@/lib/safe-tools-types'

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

type StepId =
  | 'health'
  | 'email'
  | 'autonomy'
  | 'tech'
  | 'build'
  | 'agreement'
  | 'tool'
  | 'eval'

interface StepResult {
  ok: boolean
  detail: string
}

/**
 * Elite readiness checklist — William clicks through self-tests as Super Admin.
 */
export function EliteLab() {
  const { data, error, mutate, isLoading } = useSWR(
    '/api/lab/elite/status',
    jsonFetcher<EliteReadinessPayload>,
    { refreshInterval: 60_000 }
  )
  const [busy, setBusy] = useState<StepId | null>(null)
  const [results, setResults] = useState<Partial<Record<StepId, StepResult>>>({})
  const [log, setLog] = useState<string[]>([])

  function pushLog(line: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 40))
  }

  async function runStep(id: StepId, fn: () => Promise<StepResult>) {
    setBusy(id)
    try {
      const result = await fn()
      setResults((prev) => ({ ...prev, [id]: result }))
      pushLog(`${id}: ${result.ok ? 'PASS' : 'FAIL'} — ${result.detail}`)
      await mutate()
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'failed'
      setResults((prev) => ({ ...prev, [id]: { ok: false, detail } }))
      pushLog(`${id}: FAIL — ${detail}`)
    } finally {
      setBusy(null)
    }
  }

  async function setDial(dial: AutonomyDial) {
    await fetch('/api/support/autonomy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dial }),
    })
  }

  const steps: Array<{
    id: StepId
    title: string
    description: string
    run: () => Promise<StepResult>
  }> = [
    {
      id: 'health',
      title: 'Health',
      description: 'Neon SELECT 1 via elite status',
      run: async () => {
        const s = await jsonFetcher<EliteReadinessPayload>('/api/lab/elite/status')
        return {
          ok: s.healthOk,
          detail: s.healthOk ? 'DB connected' : 'DB check failed',
        }
      },
    },
    {
      id: 'email',
      title: 'emailConfigured',
      description: 'Resend/SMTP ready for forgot-password',
      run: async () => {
        const s = await jsonFetcher<EliteReadinessPayload>('/api/lab/elite/status')
        return {
          ok: s.emailConfigured,
          detail: s.emailConfigured ? 'Email configured' : 'EMAIL_FROM + Resend/SMTP missing',
        }
      },
    },
    {
      id: 'autonomy',
      title: 'Standby / autonomy dial',
      description: 'Flip assist → standby → assist (safe round-trip)',
      run: async () => {
        await setDial('standby')
        const mid = await jsonFetcher<AutonomyConfig>('/api/support/autonomy')
        await setDial('assist')
        const end = await jsonFetcher<AutonomyConfig>('/api/support/autonomy')
        const ok = mid.dial === 'standby' && end.dial === 'assist'
        return {
          ok,
          detail: `mid=${mid.dial} end=${end.dial} · mayMerge=${String(end.mayMergePr)}`,
        }
      },
    },
    {
      id: 'tech',
      title: 'Create tech ticket',
      description: 'Lab echo-chrome TEXT ticket',
      run: async () => {
        const res = await fetch('/api/lab/echo-chrome/tech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'Elite checklist: where is the BEO for tonight?',
            profileName: 'William Morrison',
            profileRole: 'EXEC',
            profileEmail: data?.adminEmail ?? 'william@echoaurion.com',
            askKnights: false,
            send: false,
          }),
        })
        const body = (await res.json()) as APIResponse<{ ticket: { id: string } }>
        if (!body.success) throw new Error(body.error)
        return { ok: true, detail: `ticket ${body.data.ticket.id}` }
      },
    },
    {
      id: 'build',
      title: 'Create gated build (EXEC)',
      description: 'FEATURE work as EXEC + agreement on file',
      run: async () => {
        const res = await fetch('/api/lab/echo-chrome/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Elite checklist banquet floor-plan add-on',
            detail: 'Sandbox build for elite readiness — do not ship.',
            tier: 'T2',
            profileName: 'William Morrison',
            profileRole: 'EXEC',
            profileEmail: data?.adminEmail ?? 'william@echoaurion.com',
            agreed: true,
            typedSignature: 'William Morrison',
          }),
        })
        const body = (await res.json()) as APIResponse<{ workRequestId: string }>
        if (!body.success) throw new Error(body.error)
        ;(window as unknown as { __eliteWorkId?: string }).__eliteWorkId = body.data.workRequestId
        return { ok: true, detail: `work ${body.data.workRequestId}` }
      },
    },
    {
      id: 'agreement',
      title: 'Agreement sign → authorize',
      description: 'Billing authorize after paid-via-profile agreement',
      run: async () => {
        const workId = (window as unknown as { __eliteWorkId?: string }).__eliteWorkId
        if (!workId) throw new Error('Run gated build first')
        const res = await fetch('/api/lab/echo-chrome/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workRequestId: workId }),
        })
        const body = (await res.json()) as APIResponse<{ status: string }>
        if (!body.success) throw new Error(body.error)
        return { ok: true, detail: `authorized · ${body.data.status}` }
      },
    },
    {
      id: 'tool',
      title: 'Safe tool dry-run',
      description: 'open_panel dry-run on lab clientKey',
      run: async () => {
        const res = await fetch('/api/tools/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'open_panel' satisfies SafeTool,
            clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
            dryRun: true,
            params: { panelId: 'help-desk' },
          }),
        })
        const body = (await res.json()) as APIResponse<ToolInvokeResult>
        if (!body.success) throw new Error(body.error)
        return {
          ok: body.data.dryRun && !body.data.executed,
          detail: body.data.message,
        }
      },
    },
    {
      id: 'eval',
      title: 'Eval suite run',
      description: 'Classifier sandbox (~18 cases)',
      run: async () => {
        const res = await fetch('/api/help-desk/eval/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ withDrafts: false }),
        })
        const body = (await res.json()) as APIResponse<EvalRunSummary>
        if (!body.success) throw new Error(body.error)
        return {
          ok: body.data.score >= 70,
          detail: `score ${body.data.score}% · ${body.data.passed}/${body.data.total}`,
        }
      },
    },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 pb-16">
      <div>
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Elite lab</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
          Dr. OS readiness checklist
        </h1>
        <p className="mt-2 text-sm text-[#a0a0b8]">
          Sign in as{' '}
          <span className="font-mono text-white">
            {data?.adminEmail ?? 'william@echoaurion.com'}
          </span>{' '}
          · role {data?.roles.os ?? 'DR. OS'} / paid gate {data?.roles.paid ?? 'EXEC'}. Constitution v
          {data?.constitutionVersion ?? '…'}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">Health</p>
          <div className="mt-2">
            <StatusBadge
              level={data?.healthOk ? 'ok' : 'error'}
              label={data?.healthOk ? 'Healthy' : 'Error'}
            />
          </div>
        </div>
        <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">Autonomy</p>
          <p className="mt-2 font-mono text-sm text-white">{data?.autonomy.dial ?? '…'}</p>
          <p className="text-xs text-[#5a5a78]">no merge / no paid execute</p>
        </div>
        <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">Last eval</p>
          <p className="mt-2 font-mono text-2xl tabular-nums text-white">
            {data?.lastEvalScore != null ? `${data.lastEvalScore}%` : '—'}
          </p>
          <p className="text-xs text-[#5a5a78]">cap ${data?.spendCapUsd ?? 5000}/mo</p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}{' '}
          <button type="button" className="text-[#D4AF37] underline" onClick={() => void mutate()}>
            Retry
          </button>
        </p>
      ) : null}

      <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Autonomy dial</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {AUTONOMY_DIALS.map((dial) => {
            const active = data?.autonomy.dial === dial
            return (
              <button
                key={dial}
                type="button"
                aria-label={`Set autonomy to ${AUTONOMY_LABEL[dial]}`}
                aria-pressed={active}
                disabled={!!busy}
                onClick={() =>
                  void runStep('autonomy', async () => {
                    await setDial(dial)
                    return { ok: true, detail: `set ${dial}` }
                  })
                }
                className={
                  active
                    ? 'rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2 text-xs text-[#D4AF37]'
                    : 'rounded-lg border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8] hover:bg-[#22223a]'
                }
              >
                {dial}
              </button>
            )
          })}
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => {
          const result = results[step.id]
          return (
            <li
              key={step.id}
              className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  <span className="font-mono text-[#5a5a78]">{i + 1}.</span> {step.title}
                </p>
                <p className="text-xs text-[#a0a0b8]">{step.description}</p>
                {result ? (
                  <p className="mt-1 text-xs text-[#a0a0b8]">
                    <StatusBadge
                      level={result.ok ? 'ok' : 'error'}
                      label={result.ok ? 'Pass' : 'Fail'}
                    />{' '}
                    <span className="font-mono">{result.detail}</span>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!!busy || isLoading}
                aria-label={`Run ${step.title} self-test`}
                onClick={() => void runStep(step.id, step.run)}
                className="shrink-0 rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-4 py-2.5 text-xs text-[#D4AF37] disabled:opacity-40"
              >
                {busy === step.id ? 'Running…' : 'Run'}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Toolbelt (dry-run)</p>
        <p className="mt-1 text-xs text-[#a0a0b8]">
          Allowlisted: {SAFE_TOOLS.join(', ')}. Never RDP.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['show_message', 'navigate', 'clear_cache', 'rollback_hint'] as SafeTool[]).map(
            (tool) => (
              <button
                key={tool}
                type="button"
                disabled={!!busy}
                aria-label={`Dry-run ${tool}`}
                onClick={() =>
                  void runStep('tool', async () => {
                    const res = await fetch('/api/tools/invoke', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tool,
                        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
                        dryRun: true,
                        params:
                          tool === 'show_message'
                            ? { title: 'Elite', body: 'Dry-run message' }
                            : tool === 'navigate'
                              ? { path: '/help' }
                              : tool === 'rollback_hint'
                                ? { rollbackRef: 'elite-rollback-test' }
                                : {},
                      }),
                    })
                    const body = (await res.json()) as APIResponse<ToolInvokeResult>
                    if (!body.success) throw new Error(body.error)
                    return { ok: true, detail: body.data.message }
                  })
                }
                className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
              >
                {tool}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/lab/echo-chrome"
          className="rounded-lg border border-[#D4AF37] px-3 py-2 text-xs text-[#D4AF37]"
          aria-label="Open Echo chrome lab"
        >
          Echo chrome lab
        </Link>
        <Link
          href="/help-desk"
          className="rounded-lg border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8]"
          aria-label="Open Help Desk"
        >
          Help Desk
        </Link>
        <Link
          href="/support/pilot-links"
          className="rounded-lg border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8]"
          aria-label="Open Pilot links"
        >
          Pilot links
        </Link>
      </div>

      {log.length > 0 ? (
        <div className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">Run log</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-[#a0a0b8]">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
