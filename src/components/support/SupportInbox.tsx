'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { KPICard, KPIValue } from '@/components/ui/KPICard'
import type { APIResponse } from '@/types'
import type { InboxItem } from '@/app/api/support/inbox/route'

async function fetcher(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<{
    items: InboxItem[]
    counts: { questions: number; work: number; total: number }
  }>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function ago(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

function policyLevel(
  rec: string
): 'ok' | 'warn' | 'error' | 'unknown' {
  if (rec === 'FREE_ANSWER' || rec === 'COMPLIMENTARY_FIX') return 'ok'
  if (rec === 'QUOTE_REQUIRED') return 'warn'
  return 'unknown'
}

export function SupportInbox() {
  const { data, error, isLoading, mutate } = useSWR('/api/support/inbox', fetcher, {
    refreshInterval: 30_000,
  })

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-6 text-sm text-[#a0a0b8]">
        <span aria-label="Error">✕</span>
        <span>Error: {error.message}</span>
        <button
          type="button"
          onClick={() => mutate()}
          className="text-xs text-[#D4AF37] underline"
          aria-label="Retry loading inbox"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !data) {
    return <div className="h-48 animate-pulse rounded-xl bg-[#12121a]" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard title="Inbox">
          <KPIValue value={String(data.counts.total)} sub="items needing attention" />
        </KPICard>
        <KPICard title="Questions">
          <KPIValue value={String(data.counts.questions)} sub="NEW / DRAFTED" />
        </KPICard>
        <KPICard title="Change requests">
          <KPIValue value={String(data.counts.work)} sub="RECEIVED / QUOTED" />
        </KPICard>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/support"
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Open full Support console"
        >
          Full Support console
        </Link>
        <button
          type="button"
          onClick={() => mutate()}
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Refresh inbox"
        >
          Refresh
        </button>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-8 text-center">
          <StatusBadge level="ok" label="Clear" />
          <p className="mt-3 text-sm text-[#a0a0b8]">Inbox empty — no open questions or work to triage.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      level={item.kind === 'question' ? 'unknown' : 'warn'}
                      label={item.kind === 'question' ? 'Question' : 'Change request'}
                    />
                    <StatusBadge level="unknown" label={item.status} />
                    <StatusBadge
                      level={policyLevel(item.policy.recommendation)}
                      label={`${item.policy.shape} ${item.policy.label}`}
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#a0a0b8]">{item.detail}</p>
                  <p className="mt-2 font-mono text-[10px] text-[#5a5a78]">
                    {item.clientLabel ?? item.clientKey} · {ago(item.createdAt)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#5a5a78]">{item.policy.operatorHint}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col gap-2 sm:items-end">
                  <Link
                    href={item.href}
                    className="rounded-lg border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37] transition-colors duration-150 hover:bg-[#1a1a26]"
                    aria-label={`Open ${item.title} in Support`}
                  >
                    Open in Support
                  </Link>
                  {item.kind === 'work' ? (
                    <p className="text-[10px] text-[#5a5a78]">
                      Use Approve free / Send quote on the work card
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#5a5a78]">Draft + Approve &amp; send on the question card</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
