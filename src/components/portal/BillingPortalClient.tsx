'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { BillingPortalView } from '@/lib/billing-portal'

function formatUSD(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

/**
 * Token-gated billing contact portal — quote history without Dr. OS.
 */
export function BillingPortalClient() {
  const [token, setToken] = useState('')
  const [data, setData] = useState<BillingPortalView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/billing', {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: 'no-store',
      })
      const body = (await res.json()) as APIResponse<BillingPortalView>
      if (!body.success) throw new Error(body.error)
      setData(body.data)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">EchoAurion</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Billing portal</h1>
        <p className="mt-2 text-sm text-[#a0a0b8]">
          Quote history and WorkAgreement status for your property. Paste the billing contact token
          you received from EchoAurion — no full admin login required.
        </p>

        <form
          className="mt-6 flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void load()
          }}
        >
          <label className="flex flex-col text-xs text-[#a0a0b8]">
            Billing contact token
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              aria-label="Billing contact token"
              className="mt-1 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 font-mono text-sm text-white focus:border-[#D4AF37] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || token.trim().length < 16}
            aria-label="View quotes"
            className="self-start rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-4 py-2 text-sm font-medium text-[#D4AF37] hover:bg-[#22223a] disabled:opacity-40"
          >
            {busy ? 'Loading…' : 'View quotes'}
          </button>
          {error ? (
            <p className="text-sm text-[#a0a0b8]">
              <span aria-label="Error">✕</span> {error}
            </p>
          ) : null}
        </form>

        {data ? (
          <section className="mt-8" aria-label="Quote history">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge level="ok" label={`✓ ${data.contactName}`} />
              <span className="font-mono text-[11px] text-[#5a5a78]">{data.clientKey}</span>
            </div>
            {data.quotes.length === 0 ? (
              <p className="mt-4 text-sm text-[#a0a0b8]">No quotes on file for this property yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {data.quotes.map((q) => (
                  <li
                    key={q.id}
                    className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-white">
                          <span className="text-[#D4AF37]">{q.kind}</span> · {q.title}
                        </p>
                        <p className="mt-1 text-[11px] text-[#5a5a78]">
                          {formatDistanceToNow(new Date(q.createdAt), { addSuffix: true })}
                          {q.tier ? ` · ${q.tier}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums text-white">
                          {formatUSD(q.quoteTotal)}
                        </span>
                        <StatusBadge
                          level={
                            q.status === 'EXECUTED'
                              ? 'ok'
                              : q.status === 'AUTHORIZED' || q.status === 'QUOTED'
                                ? 'warn'
                                : 'unknown'
                          }
                          label={q.statusLabel}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#a0a0b8]">
                      {q.hasAgreement ? (
                        <StatusBadge level="ok" label="✓ Agreement signed" />
                      ) : (
                        <StatusBadge level="unknown" label="○ No agreement yet" />
                      )}
                      {q.invoiceStatus ? (
                        <StatusBadge
                          level={q.invoiceStatus === 'paid' ? 'ok' : 'warn'}
                          label={`Invoice ${q.invoiceStatus}`}
                        />
                      ) : null}
                      {q.invoiceUrl ? (
                        <a
                          href={q.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#D4AF37] underline"
                          aria-label="Open Stripe hosted invoice"
                        >
                          Open invoice
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  )
}
