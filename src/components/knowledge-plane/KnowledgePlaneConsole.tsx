'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

interface SignalsSummary {
  total: number
  byType: { signalType: string; count: number }[]
  recent: {
    id: string
    signalType: string
    aggregationLevel: string
    territoryCode: string | null
    sampleSize: number | null
    confidence: number | null
    createdAt: string
  }[]
}

interface InsightRow {
  id: string
  title: string
  summary: string
  insightClass: string
  aggregationLevel: string
  territoryCode: string | null
  confidence: number | null
  sampleSize: number | null
  sourceSeat: string | null
  published: boolean
  createdAt: string
}

interface VendorRow {
  id: string
  vendorName: string
  contactEmail: string | null
  useCase: string
  scopeNotes: string | null
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'REVOKED'
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

const VENDOR_STATUS: Record<
  VendorRow['status'],
  { level: 'ok' | 'warn' | 'error' | 'unknown'; label: string }
> = {
  PENDING: { level: 'warn', label: 'Pending scrutiny' },
  APPROVED: { level: 'ok', label: 'Approved' },
  DENIED: { level: 'error', label: 'Denied' },
  REVOKED: { level: 'unknown', label: 'Revoked' },
}

function ago(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

export function KnowledgePlaneConsole() {
  const { data: signals, error: signalsError } = useSWR(
    '/api/knowledge/signals',
    jsonFetcher<SignalsSummary>,
    { refreshInterval: 60_000 }
  )
  const { data: insights, error: insightsError } = useSWR(
    '/api/knowledge/insights',
    jsonFetcher<InsightRow[]>,
    { refreshInterval: 60_000 }
  )
  const { data: vendors, error: vendorsError } = useSWR(
    '/api/knowledge/vendors',
    jsonFetcher<VendorRow[]>,
    { refreshInterval: 60_000 }
  )
  const { data: learning, mutate: mutateLearning } = useSWR(
    '/api/knowledge/learning-stats',
    jsonFetcher<{
      chunks: number
      bySection: { section: string; count: number }[]
      lastIngestAt: string | null
      lastSignalAt: string | null
      piiScrubActive: boolean
      embeddingsEnabled: boolean
      queue: { pending: number; running: number; failed: number }
      label: string
      embeddingsLabel: string
    }>,
    { refreshInterval: 60_000 }
  )

  const [vendorName, setVendorName] = useState('')
  const [useCase, setUseCase] = useState('')
  const [busy, setBusy] = useState(false)
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  async function createVendor(e: React.FormEvent) {
    e.preventDefault()
    if (!vendorName.trim() || !useCase.trim()) return
    setBusy(true)
    try {
      await fetch('/api/knowledge/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorName: vendorName.trim(), useCase: useCase.trim() }),
      })
      setVendorName('')
      setUseCase('')
      await mutate('/api/knowledge/vendors')
    } finally {
      setBusy(false)
    }
  }

  async function vendorOp(id: string, op: 'approve' | 'deny' | 'revoke') {
    await fetch('/api/knowledge/vendors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, op }),
    })
    await mutate('/api/knowledge/vendors')
  }

  async function runBackfill() {
    setBackfillBusy(true)
    setBackfillMsg(null)
    try {
      const res = await fetch('/api/knowledge/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 200 }),
      })
      const body = (await res.json()) as APIResponse<{
        chunksAfter: number
        signalsAfter: number
        label: string
      }>
      if (!body.success) {
        setBackfillMsg(`✕ ${body.error}`)
        return
      }
      setBackfillMsg(body.data.label)
      await Promise.all([
        mutateLearning(),
        mutate('/api/knowledge/signals'),
        mutate('/api/knowledge/insights'),
      ])
    } catch (err) {
      setBackfillMsg(err instanceof Error ? `✕ ${err.message}` : '✕ Backfill failed')
    } finally {
      setBackfillBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-xl border border-[#D4AF37]/40 bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
        role="status"
        aria-label="Privacy banner: No guest PII. Aggregated learning only."
      >
        <p className="text-sm font-medium text-[#D4AF37]">
          No guest PII. Aggregated learning only.
        </p>
        <p className="mt-1 text-xs text-[#a0a0b8]">
          Aurion Knowledge Plane (Echo Resonance Network) — hub-spoke telemetry from Echo AI³.
          Property → territory → network. Vendors require a second scrutiny gate. See{' '}
          <code className="text-[#D4AF37]">docs/AURION_KNOWLEDGE_PLANE.md</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard title="Signals (count)">
          <KPIValue value={String(signals?.total ?? '—')} sub="anonymized events stored" />
        </KPICard>
        <KPICard title="Insights">
          <KPIValue value={String(insights?.length ?? '—')} sub="assembled summaries" />
        </KPICard>
        <KPICard
          title="Vendor gate"
          badge={
            <StatusBadge
              level={(vendors?.filter((v) => v.status === 'PENDING').length ?? 0) > 0 ? 'warn' : 'ok'}
              label="Scrutiny"
              count={vendors?.filter((v) => v.status === 'PENDING').length}
            />
          }
        >
          <KPIValue
            value={String(vendors?.filter((v) => v.status === 'PENDING').length ?? 0)}
            sub="pending access requests"
          />
        </KPICard>
      </div>

      <section
        className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4"
        aria-label="Echo learning plane stats"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-[#D4AF37]">
              Echo learning plane
            </h2>
            <p className="mt-1 text-xs text-[#a0a0b8]">
              PII-safe chunks for runbooks / help / error patterns. See{' '}
              <code className="text-[#D4AF37]">docs/ECHO_LEARNING_PLANE.md</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={runBackfill}
            disabled={backfillBusy}
            aria-label="Backfill learning from runbooks and help files"
            className="rounded-lg border border-[#D4AF37] px-3 py-2 text-xs text-[#D4AF37] transition-colors duration-150 hover:bg-[#1a1a26] disabled:opacity-50"
          >
            {backfillBusy ? 'Backfilling…' : 'Backfill learning'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge
            level={learning?.piiScrubActive ? 'ok' : 'error'}
            label={learning?.label ?? '? PII scrub status unknown'}
          />
          <StatusBadge
            level="unknown"
            label={learning?.embeddingsLabel ?? '○ Embeddings deferred'}
          />
          <StatusBadge
            level={(learning?.queue.pending ?? 0) > 50 ? 'warn' : 'ok'}
            label={
              learning
                ? `Queue ${learning.queue.pending} pending`
                : 'Queue —'
            }
          />
          {learning?.lastIngestAt ? (
            <StatusBadge
              level="ok"
              label={`Last chunk ${ago(learning.lastIngestAt)}`}
            />
          ) : (
            <StatusBadge level="unknown" label="No chunks ingested yet" />
          )}
        </div>
        {backfillMsg ? (
          <p className="mt-2 text-xs text-[#a0a0b8]" role="status">
            {backfillMsg}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KPICard title="Learning chunks">
            <KPIValue
              value={String(learning?.chunks ?? '—')}
              sub="redacted · GLOBAL/COHORT shareable"
            />
          </KPICard>
          <KPICard title="By section">
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(learning?.bySection ?? []).length === 0 ? (
                <span className="text-xs text-[#5a5a78]">No chunks yet</span>
              ) : (
                learning?.bySection.map((s) => (
                  <span
                    key={s.section}
                    className="rounded border border-[#2a2a3f] px-2 py-0.5 font-mono text-[11px] text-[#a0a0b8]"
                  >
                    {s.section}: {s.count}
                  </span>
                ))
              )}
            </div>
          </KPICard>
        </div>
      </section>

      <section className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
        <h2 className="text-xs uppercase tracking-widest text-[#D4AF37]">Recent signals (meta only)</h2>
        {signalsError ? (
          <p className="mt-3 text-sm text-[#a0a0b8]">
            <span aria-label="Error">✕</span> Error: {signalsError.message}
          </p>
        ) : !signals ? (
          <p className="mt-3 animate-pulse text-sm text-[#5a5a78]">Loading signal counts…</p>
        ) : signals.recent.length === 0 ? (
          <p className="mt-3 text-sm text-[#a0a0b8]">
            No signals yet — auto-filled when learning chunks are ingested (knowledge_meta), or via
            Echo edge POST /api/knowledge/ingest. Use Backfill learning above after deploy.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[#2a2a3f]">
            {signals.recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge level="ok" label={s.signalType.replace(/_/g, ' ')} />
                  <span className="text-[#a0a0b8]">{s.aggregationLevel}</span>
                  {s.territoryCode ? (
                    <span className="font-mono text-xs text-[#5a5a78]">{s.territoryCode}</span>
                  ) : null}
                </div>
                <span className="font-mono text-xs tabular-nums text-[#5a5a78]">{ago(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {signals && signals.byType.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {signals.byType.map((t) => (
              <span
                key={t.signalType}
                className="rounded border border-[#2a2a3f] px-2 py-1 font-mono text-[11px] text-[#a0a0b8]"
              >
                {t.signalType}: {t.count}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
        <h2 className="text-xs uppercase tracking-widest text-[#D4AF37]">Insights</h2>
        {insightsError ? (
          <p className="mt-3 text-sm text-[#a0a0b8]">
            <span aria-label="Error">✕</span> Error: {insightsError.message}
          </p>
        ) : !insights ? (
          <p className="mt-3 animate-pulse text-sm text-[#5a5a78]">Loading insights…</p>
        ) : insights.length === 0 ? (
          <p className="mt-3 text-sm text-[#a0a0b8]">
            No assembled insights yet — Maestro / Perplexity seat will populate these from aggregated
            signals.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {insights.map((i) => (
              <li key={i.id} className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-white">{i.title}</p>
                  <StatusBadge
                    level={i.published ? 'ok' : 'unknown'}
                    label={i.published ? 'Published' : 'Draft'}
                  />
                </div>
                <p className="mt-1 text-xs text-[#a0a0b8]">{i.summary}</p>
                <p className="mt-2 font-mono text-[10px] text-[#5a5a78]">
                  {i.insightClass} · {i.aggregationLevel}
                  {i.territoryCode ? ` · ${i.territoryCode}` : ''} · {ago(i.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
        <h2 className="text-xs uppercase tracking-widest text-[#D4AF37]">Vendor access (scrutiny gate)</h2>
        <form onSubmit={createVendor} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Vendor name"
            aria-label="Vendor name"
            className="flex-1 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white"
          />
          <input
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            placeholder="Use case / scope"
            aria-label="Vendor use case"
            className="flex-[2] rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={busy}
            aria-label="Submit vendor access request"
            className="rounded-lg border border-[#D4AF37] px-3 py-2 text-xs text-[#D4AF37] transition-colors duration-150 hover:bg-[#1a1a26] disabled:opacity-50"
          >
            Request
          </button>
        </form>

        {vendorsError ? (
          <p className="mt-3 text-sm text-[#a0a0b8]">
            <span aria-label="Error">✕</span> Error: {vendorsError.message}
          </p>
        ) : !vendors ? (
          <p className="mt-3 animate-pulse text-sm text-[#5a5a78]">Loading vendor requests…</p>
        ) : vendors.length === 0 ? (
          <p className="mt-3 text-sm text-[#a0a0b8]">No vendor access requests.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {vendors.map((v) => {
              const badge = VENDOR_STATUS[v.status]
              return (
                <li
                  key={v.id}
                  className="flex flex-col gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">{v.vendorName}</p>
                      <StatusBadge level={badge.level} label={badge.label} />
                    </div>
                    <p className="mt-1 text-xs text-[#a0a0b8]">{v.useCase}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {v.status === 'PENDING' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => vendorOp(v.id, 'approve')}
                          aria-label={`Approve ${v.vendorName}`}
                          className="rounded border border-[#22c55e] px-2 py-1 text-[11px] text-[#22c55e]"
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => vendorOp(v.id, 'deny')}
                          aria-label={`Deny ${v.vendorName}`}
                          className="rounded border border-[#ef4444] px-2 py-1 text-[11px] text-[#ef4444]"
                        >
                          ✕ Deny
                        </button>
                      </>
                    ) : v.status === 'APPROVED' ? (
                      <button
                        type="button"
                        onClick={() => vendorOp(v.id, 'revoke')}
                        aria-label={`Revoke ${v.vendorName}`}
                        className="rounded border border-[#2a2a3f] px-2 py-1 text-[11px] text-[#a0a0b8]"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
