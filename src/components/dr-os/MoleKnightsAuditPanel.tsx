'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { MoleKnightsAudit } from '@/lib/mole-knights-audit'

async function auditFetcher(url: string): Promise<MoleKnightsAudit> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<MoleKnightsAudit>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function riskLevel(
  risk: 'review' | 'likely_hallucination' | 'needs_confirm'
): 'ok' | 'warn' | 'error' | 'unknown' {
  if (risk === 'likely_hallucination') return 'error'
  if (risk === 'needs_confirm') return 'warn'
  return 'unknown'
}

/**
 * Mole + Knights audit — morning-open mole health + unconfirmed / mismatched runbooks.
 */
export function MoleKnightsAuditPanel() {
  const { data, error, mutate, isLoading } = useSWR(
    '/api/ops/mole-knights-audit',
    auditFetcher,
    { refreshInterval: 120_000, revalidateOnFocus: false }
  )
  const [deskBusy, setDeskBusy] = useState(false)
  const [deskMsg, setDeskMsg] = useState<string | null>(null)

  async function runDeskMoles(fileTicket: boolean) {
    setDeskBusy(true)
    setDeskMsg(null)
    try {
      const q = fileTicket ? '' : '?dryRun=1'
      const res = await fetch(`/api/ops/desk-moles-run${q}`, { method: 'POST' })
      const body = (await res.json()) as APIResponse<{ label: string }>
      if (!body.success) throw new Error(body.error)
      setDeskMsg(body.data.label)
      await mutate()
    } catch (e) {
      setDeskMsg(e instanceof Error ? `✕ ${e.message}` : '✕ Desk moles failed')
    } finally {
      setDeskBusy(false)
    }
  }

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Mole and Knights audit"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Mole · Knights audit
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={deskBusy}
            onClick={() => void runDeskMoles(false)}
            aria-label="Dry-run three desk moles"
            className="text-[10px] text-[#a0a0b8] underline disabled:opacity-40"
          >
            {deskBusy ? '…' : 'Desk moles dry-run'}
          </button>
          <button
            type="button"
            disabled={deskBusy}
            onClick={() => void runDeskMoles(true)}
            aria-label="Run desk moles and file Help Desk task ticket"
            className="text-[10px] text-[#D4AF37] underline disabled:opacity-40"
          >
            File desk-mole ticket
          </button>
          <button
            type="button"
            onClick={() => void mutate()}
            aria-label="Refresh mole and Knights audit"
            className="text-[10px] text-[#D4AF37] underline"
          >
            Refresh
          </button>
        </div>
      </div>
      {deskMsg ? (
        <p className="mt-2 text-[11px] text-[#a0a0b8]" role="status">
          {deskMsg}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : isLoading || !data ? (
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">Night Cleaner Mole</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge
                level={data.mole.doingJob ? 'ok' : data.mole.chip.stale ? 'warn' : 'error'}
                label={data.mole.verdict}
              />
              <StatusBadge
                level={data.mole.deskMolesCronWired ? 'ok' : 'error'}
                label={
                  data.mole.deskMolesCronWired
                    ? '✓ Desk-moles cron in render.yaml'
                    : '✕ Desk-moles cron missing'
                }
              />
              <StatusBadge
                level={data.mole.scannersWiredInRepo ? 'ok' : 'warn'}
                label={
                  data.mole.scannersWiredInRepo
                    ? '✓ COS src/ scanner wired'
                    : '▲ Scanners unwired'
                }
              />
              <StatusBadge
                level={data.mole.nightCleanerCronWired ? 'ok' : 'warn'}
                label={
                  data.mole.nightCleanerCronWired
                    ? '✓ Product night-cleaner cron'
                    : '▲ Product night-cleaner cron missing'
                }
              />
              {data.mole.openNightCleanerTickets > 0 ? (
                <StatusBadge
                  level="warn"
                  label={`Open NC tickets: ${data.mole.openNightCleanerTickets}`}
                />
              ) : null}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-[#a0a0b8]">
              {data.mole.gaps.slice(0, 4).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">Knight runbooks</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge
                level="ok"
                label={`✓ PROMOTED ${data.knights.runbooks.promoted}`}
              />
              <StatusBadge
                level={data.knights.runbooks.draft > 0 ? 'warn' : 'ok'}
                label={`▲ DRAFT ${data.knights.runbooks.draft}`}
              />
              <StatusBadge
                level="unknown"
                label={`✕ REJECTED ${data.knights.runbooks.rejected}`}
              />
              <StatusBadge
                level={
                  data.knights.evals.unmatchedCount > data.knights.evals.matchedCount
                    ? 'warn'
                    : 'ok'
                }
                label={`Eval match ${data.knights.evals.matchedCount}/${data.knights.evals.recentCount}`}
              />
              {data.knights.coreDeniedAudits7d > 0 ? (
                <StatusBadge
                  level="ok"
                  label={`✓ Core denies 7d: ${data.knights.coreDeniedAudits7d}`}
                />
              ) : null}
            </div>
          </div>

          {data.knights.draftRunbooks.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">
                Unconfirmed DRAFTs (triage — not taught to Knights)
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {data.knights.draftRunbooks.slice(0, 12).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        level={riskLevel(r.risk)}
                        label={
                          r.risk === 'likely_hallucination'
                            ? '✕ Likely hallucination'
                            : r.risk === 'needs_confirm'
                              ? '▲ Needs confirm'
                              : '? Review'
                        }
                      />
                      <span className="text-xs text-white">{r.title}</span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                      {r.productLine} · hits {r.hitCount}
                      {r.evalScore != null ? ` · eval ${r.evalScore.toFixed(2)}` : ' · no eval'}
                      {r.sourceTicketId ? (
                        <>
                          {' · '}
                          <Link
                            href={`/help-desk?ticket=${encodeURIComponent(r.sourceTicketId)}`}
                            className="text-[#D4AF37] underline"
                          >
                            ticket
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-[#a0a0b8]">No DRAFT runbooks waiting — good.</p>
          )}

          {data.knights.evals.hallucinationSuspects.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">
                KnightEval mismatches (draft ≠ final fix)
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {data.knights.evals.hallucinationSuspects.slice(0, 8).map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-[11px] text-[#a0a0b8]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        level="error"
                        label={`✕ Score ${e.score.toFixed(2)}`}
                      />
                      <Link
                        href={`/help-desk?ticket=${encodeURIComponent(e.ticketId)}`}
                        className="text-[#D4AF37] underline"
                      >
                        Open ticket
                      </Link>
                    </div>
                    <p className="mt-1">
                      <span className="text-[#5a5a78]">Draft:</span> {e.draftPreview}
                    </p>
                    <p className="mt-0.5">
                      <span className="text-[#5a5a78]">Final:</span> {e.finalPreview}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.knights.openSystemTickets.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">
                Open SYSTEM tickets (unfixed / in flight)
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {data.knights.openSystemTickets.slice(0, 10).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge
                      level={t.agentWorking ? 'warn' : 'unknown'}
                      label={t.agentWorking ? '⟳ Agent working' : t.status}
                    />
                    <Link
                      href={`/help-desk?ticket=${encodeURIComponent(t.id)}`}
                      className="text-white underline-offset-2 hover:underline"
                    >
                      {t.subject}
                    </Link>
                    {t.moduleHint ? (
                      <span className="font-mono text-[10px] text-[#5a5a78]">{t.moduleHint}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.recommendations.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">Next moves</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-[#a0a0b8]">
                {data.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
