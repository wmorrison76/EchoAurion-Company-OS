'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'
import type { ContextualHelpResult } from '@/types/help-files'

/**
 * Compact contextual help entry on Dr. OS — creates/opens a Help Desk ticket
 * and runs the contextual composer.
 */
export function ContextualHelpWidget() {
  const router = useRouter()
  const [question, setQuestion] = useState('')
  const [context, setContext] = useState('{"screen":"dr-os","module":"company-os"}')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  async function run() {
    if (!question.trim()) return
    setBusy(true)
    setError(null)
    setHint(null)
    try {
      const createRes = await fetch('/api/help-desk/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'TEXT',
          subject: question.trim().slice(0, 120),
          body: question.trim(),
        }),
      })
      const created = (await createRes.json()) as APIResponse<HelpTicketDetail>
      if (!created.success) throw new Error(created.error)

      let ctx: Record<string, unknown> | string = context
      try {
        ctx = JSON.parse(context) as Record<string, unknown>
      } catch {
        /* keep string */
      }

      const ctxRes = await fetch(`/api/help-desk/tickets/${created.data.id}/contextual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), context: ctx }),
      })
      const ctxBody = (await ctxRes.json()) as APIResponse<{
        ticket: HelpTicketDetail
        contextual: ContextualHelpResult
      }>
      if (!ctxBody.success) throw new Error(ctxBody.error)

      setHint(
        `Draft ready · ${ctxBody.data.contextual.suggestedDirectives.length} directive(s) — open Help Desk to send`
      )
      router.push(`/help-desk?ticket=${created.data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Contextual help failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Contextual Help</p>
        <StatusBadge level="ok" label="24/7 draft" />
      </div>
      <p className="mt-1 text-[11px] text-[#a0a0b8]">
        Ask with screen context — Knights draft + suggested open_panel. Approve before send
        (standby may auto low-risk TEXT).
      </p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="What are you stuck on?"
        aria-label="Contextual help question from Dr OS"
        className="mt-3 w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
      />
      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        aria-label="Context JSON"
        className="mt-2 w-full rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-1.5 font-mono text-[10px] text-[#a0a0b8] focus:border-[#D4AF37] focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !question.trim()}
          onClick={() => void run()}
          className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-1.5 text-xs text-[#D4AF37] disabled:opacity-40"
          aria-label="Run contextual help"
        >
          {busy ? 'Asking Knights…' : 'Ask + open Help Desk'}
        </button>
        <a
          href="/help-files"
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Open Help Files"
        >
          Help Files
        </a>
      </div>
      {error && (
        <p className="mt-2 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error}
        </p>
      )}
      {hint && (
        <p className="mt-2 text-xs text-[#a0a0b8]">
          <span aria-label="Healthy">✓</span> {hint}
        </p>
      )}
    </div>
  )
}
