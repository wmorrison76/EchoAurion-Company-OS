'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PolicyRecommendationBanner } from '@/components/support/PolicyRecommendation'
import { classifySupportRequest } from '@/lib/support-policy'
import type { APIResponse, StatusLevel } from '@/types'
import type { CustomerQuestionView, QuestionStatus } from '@/types/support'

const QUESTIONS_KEY = '/api/support/questions'

async function fetcher(url: string): Promise<CustomerQuestionView[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<CustomerQuestionView[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const STATUS_BADGE: Record<QuestionStatus, { level: StatusLevel; label: string }> = {
  NEW: { level: 'warn', label: 'New' },
  DRAFTED: { level: 'unknown', label: 'Draft ready' },
  ANSWERED: { level: 'ok', label: 'Answered' },
  DISMISSED: { level: 'unknown', label: 'Dismissed' },
}

function QuestionCard({ q }: { q: CustomerQuestionView }) {
  const [answer, setAnswer] = useState(q.answer ?? q.draftAnswer ?? '')
  const [busy, setBusy] = useState<null | 'draft' | 'answer' | 'dismiss'>(null)
  const badge = STATUS_BADGE[q.status]
  const done = q.status === 'ANSWERED' || q.status === 'DISMISSED'
  const policy = classifySupportRequest({
    kind: 'QUESTION',
    title: q.question,
    detail: q.question,
  })

  async function draft() {
    setBusy('draft')
    try {
      const res = await fetch(`/api/support/questions/${q.id}/draft`, { method: 'POST' })
      const body = (await res.json()) as APIResponse<{ draftAnswer: string; seat: string | null }>
      if (body.success) setAnswer(body.data.draftAnswer)
      await mutate(QUESTIONS_KEY)
    } finally {
      setBusy(null)
    }
  }

  async function approve() {
    if (!answer.trim()) return
    setBusy('answer')
    try {
      await fetch(`/api/support/questions/${q.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', answer: answer.trim() }),
      })
      await mutate(QUESTIONS_KEY)
    } finally {
      setBusy(null)
    }
  }

  async function dismiss() {
    setBusy('dismiss')
    try {
      await fetch(`/api/support/questions/${q.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      await mutate(QUESTIONS_KEY)
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-[#2a2a3f] bg-[#12121a] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white">{q.question}</p>
          <p className="text-[11px] text-[#5a5a78]">
            {q.clientLabel ?? q.clientKey} · {formatDistanceToNow(new Date(q.createdAt), { addSuffix: true })}
            {q.draftSeat ? ` · drafted by ${q.draftSeat}` : ''}
            {q.status === 'ANSWERED' ? (q.delivered ? ' · delivered' : ' · awaiting pickup') : ''}
          </p>
        </div>
        <StatusBadge level={badge.level} label={badge.label} />
      </div>

      {!done ? <PolicyRecommendationBanner verdict={policy} /> : null}

      {!done ? (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Approved answer — write your own or let an AI seat draft it…"
            aria-label="Answer to customer question"
            className="w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={draft}
              disabled={busy !== null}
              aria-label="Draft answer with AI"
              className="rounded-lg border border-[#2a2a3f] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-[#a0a0b8] transition-colors duration-150 hover:text-white disabled:opacity-40"
            >
              {busy === 'draft' ? 'Drafting…' : q.draftAnswer ? 'Re-draft with AI' : 'Draft with AI'}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null || !answer.trim()}
              aria-label="Approve and send answer"
              className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs font-medium text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a] disabled:opacity-40"
            >
              {busy === 'answer' ? 'Approving…' : 'Approve & send'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy !== null}
              aria-label="Dismiss question"
              className="rounded-lg border border-transparent px-3 py-1.5 text-xs text-[#5a5a78] transition-colors duration-150 hover:text-[#a0a0b8] disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        </>
      ) : q.status === 'ANSWERED' ? (
        <p className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-[#a0a0b8]">
          {q.answer}
        </p>
      ) : null}
    </li>
  )
}

export function QuestionsPanel() {
  const { data, error } = useSWR(QUESTIONS_KEY, fetcher, { refreshInterval: 60_000 })
  const open = data?.filter((q) => q.status === 'NEW' || q.status === 'DRAFTED').length ?? 0

  return (
    <KPICard
      title="Ask the Board"
      badge={data ? <StatusBadge level={open > 0 ? 'warn' : 'ok'} label={open > 0 ? 'Needs you' : 'Clear'} count={open} /> : undefined}
    >
      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-hidden="true">✕</span> Questions unavailable: {error.message}
        </p>
      ) : !data ? (
        <p className="text-sm text-[#a0a0b8]">Loading questions…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-[#a0a0b8]">
          No customer questions yet. Deployments post to{' '}
          <code className="font-mono text-[#5a5a78]">/api/relay/questions</code>; an AI seat drafts an
          answer, you approve it here, and it flows back automatically.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </ul>
      )}
    </KPICard>
  )
}
