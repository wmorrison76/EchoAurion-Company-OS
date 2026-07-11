'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { HELP_PANELS } from '@/lib/help-panels'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'
import type { ContextualHelpResult, HelpArticleView } from '@/types/help-files'

type OutboxEvent = {
  id: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
  deliveredAt: string | null
  status: 'pending' | 'delivered'
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<T>
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

interface Props {
  ticket: HelpTicketDetail
  reply: string
  busy: string | null
  onBusy: (label: string | null) => void
  onError: (msg: string | null) => void
  onTicket: (t: HelpTicketDetail) => void
  onSetReply: (text: string) => void
}

/**
 * Send to client, open panel, send article, contextual composer, outbox status.
 */
export function ClientAssistPanel({
  ticket,
  reply,
  busy,
  onBusy,
  onError,
  onTicket,
  onSetReply,
}: Props) {
  const [panelId, setPanelId] = useState('beo')
  const [articleQ, setArticleQ] = useState('')
  const [contextualQ, setContextualQ] = useState('')
  const [contextJson, setContextJson] = useState('')
  const [suggested, setSuggested] = useState<ContextualHelpResult | null>(null)

  const hasClient = Boolean(ticket.clientKey)

  const { data: outbox, mutate: mutateOutbox } = useSWR(
    ticket.id ? `/api/help-desk/tickets/${ticket.id}/outbox` : null,
    jsonFetcher<{ clientKey: string | null; events: OutboxEvent[]; note: string }>,
    { refreshInterval: 20_000 }
  )

  const searchUrl = articleQ.trim()
    ? `/api/help-files/search?q=${encodeURIComponent(articleQ.trim())}`
    : '/api/help-files'

  const { data: articles } = useSWR(searchUrl, jsonFetcher<HelpArticleView[]>, {
    refreshInterval: 0,
  })

  useEffect(() => {
    setSuggested(null)
  }, [ticket.id])

  async function run(
    label: string,
    url: string,
    payload?: unknown
  ): Promise<HelpTicketDetail | null> {
    onBusy(label)
    onError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      })
      const body = (await res.json()) as APIResponse<
        HelpTicketDetail | { ticket: HelpTicketDetail; contextual: ContextualHelpResult }
      >
      if (!body.success) throw new Error(body.error)

      if (
        body.data &&
        typeof body.data === 'object' &&
        'ticket' in body.data &&
        'contextual' in body.data
      ) {
        const wrapped = body.data as {
          ticket: HelpTicketDetail
          contextual: ContextualHelpResult
        }
        setSuggested(wrapped.contextual)
        if (wrapped.contextual.draftAnswer) {
          onSetReply(wrapped.contextual.draftAnswer)
        }
        onTicket(wrapped.ticket)
        await mutateOutbox()
        return wrapped.ticket
      }

      const t = body.data as HelpTicketDetail
      onTicket(t)
      await mutateOutbox()
      return t
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Action failed')
      return null
    } finally {
      onBusy(null)
    }
  }

  async function sendToClient(withPanel: boolean) {
    if (!reply.trim()) {
      onError('Type a message (or use a knight draft) before sending to client')
      return
    }
    await run('send-client', `/api/help-desk/tickets/${ticket.id}/send-to-client`, {
      message: reply.trim(),
      title: 'Support reply',
      panelId: withPanel ? panelId : undefined,
      resolve: false,
    })
  }

  async function openPanel() {
    await run('open-panel', `/api/help-desk/tickets/${ticket.id}/open-panel`, {
      panelId,
    })
  }

  async function sendArticle(articleId: string) {
    await run('send-article', `/api/help-desk/tickets/${ticket.id}/send-article`, {
      articleId,
    })
  }

  async function insertArticle(a: HelpArticleView) {
    onSetReply(`${a.title}\n\n${a.body}`)
    if (a.panelId) setPanelId(a.panelId)
  }

  async function runContextual() {
    if (!contextualQ.trim()) {
      onError('Enter a contextual question')
      return
    }
    let context: Record<string, unknown> | string | undefined
    if (contextJson.trim()) {
      try {
        context = JSON.parse(contextJson) as Record<string, unknown>
      } catch {
        context = contextJson.trim()
      }
    }
    await run('contextual', `/api/help-desk/tickets/${ticket.id}/contextual`, {
      question: contextualQ.trim(),
      context,
    })
  }

  async function applySuggestedAndSend() {
    if (!suggested?.draftAnswer && !reply.trim()) return
    const open = suggested?.suggestedDirectives.find((d) => d.type === 'open_panel')
    await run('send-client', `/api/help-desk/tickets/${ticket.id}/send-to-client`, {
      message: (suggested?.draftAnswer || reply).trim(),
      title: 'Support reply',
      panelId: open?.panelId,
      panelParams: open?.params,
      resolve: false,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] p-3">
      <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Client delivery</p>
      {!hasClient && (
        <p className="text-[11px] text-[#a0a0b8]">
          <span aria-label="Warning">⚠</span> No clientKey on this ticket — set one to push via
          relay.
        </p>
      )}
      {hasClient && (
        <p className="font-mono text-[10px] text-[#5a5a78]">
          {ticket.clientKey} · {outbox?.note ?? 'SSE will push when pilot connected'}
        </p>
      )}

      {/* Outbox status */}
      {outbox && outbox.events.length > 0 && (
        <ul className="flex max-h-28 flex-col gap-1 overflow-y-auto" aria-label="Outbox delivery status">
          {outbox.events.slice(0, 8).map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-2 rounded border border-[#2a2a3f] px-2 py-1"
            >
              <StatusBadge
                level={e.status === 'delivered' ? 'ok' : 'warn'}
                label={e.status === 'delivered' ? 'Delivered' : 'Pending'}
              />
              <span className="font-mono text-[10px] text-[#a0a0b8]">{e.type}</span>
              <span className="font-mono text-[10px] text-[#5a5a78]">{ago(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Panel picker + actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-widest text-[#5a5a78]" htmlFor="ca-panel">
            Panel
          </label>
          <select
            id="ca-panel"
            value={panelId}
            onChange={(e) => setPanelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-xs text-white"
            aria-label="Panel to open for client"
          >
            {HELP_PANELS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!!busy || !hasClient || !reply.trim()}
            onClick={() => void sendToClient(false)}
            className="rounded-lg border border-[#22c55e] px-2.5 py-1.5 text-[11px] text-white disabled:opacity-40"
            aria-label="Send reply to client now"
          >
            {busy === 'send-client' ? '…' : 'Send to client now'}
          </button>
          <button
            type="button"
            disabled={!!busy || !hasClient || !reply.trim()}
            onClick={() => void sendToClient(true)}
            className="rounded-lg border border-[#D4AF37] px-2.5 py-1.5 text-[11px] text-[#D4AF37] disabled:opacity-40"
            aria-label="Send reply and open panel for client"
          >
            Send + open panel
          </button>
          <button
            type="button"
            disabled={!!busy || !hasClient}
            onClick={() => void openPanel()}
            className="rounded-lg border border-[#2a2a3f] px-2.5 py-1.5 text-[11px] text-[#a0a0b8] disabled:opacity-40"
            aria-label="Open panel for client"
          >
            {busy === 'open-panel' ? '…' : 'Open panel'}
          </button>
        </div>
      </div>

      {/* Insert / send article */}
      <div className="border-t border-[#2a2a3f] pt-3">
        <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">Help article</p>
        <input
          type="search"
          value={articleQ}
          onChange={(e) => setArticleQ(e.target.value)}
          placeholder="Search Help Files…"
          aria-label="Search help articles to insert or send"
          className="mt-1 w-full rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-xs text-white placeholder:text-[#5a5a78]"
        />
        <ul className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto">
          {(articles ?? []).slice(0, 6).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#2a2a3f] px-2 py-1.5"
            >
              <span className="text-[11px] text-white">{a.title}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void insertArticle(a)}
                  className="rounded border border-[#2a2a3f] px-1.5 py-0.5 text-[10px] text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
                  aria-label={`Insert article ${a.title}`}
                >
                  Insert
                </button>
                <button
                  type="button"
                  disabled={!!busy || !hasClient}
                  onClick={() => void sendArticle(a.id)}
                  className="rounded border border-[#2a2a3f] px-1.5 py-0.5 text-[10px] text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-40"
                  aria-label={`Send article ${a.title} to client`}
                >
                  Send to client
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Contextual composer */}
      <div className="border-t border-[#2a2a3f] pt-3">
        <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">Contextual question</p>
        <textarea
          value={contextualQ}
          onChange={(e) => setContextualQ(e.target.value)}
          rows={2}
          placeholder="What is the user stuck on?"
          aria-label="Contextual help question"
          className="mt-1 w-full rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 text-xs text-white placeholder:text-[#5a5a78]"
        />
        <textarea
          value={contextJson}
          onChange={(e) => setContextJson(e.target.value)}
          rows={2}
          placeholder='Optional context JSON e.g. {"screen":"beo","module":"banquet"}'
          aria-label="Optional context JSON"
          className="mt-1 w-full rounded-lg border border-[#2a2a3f] bg-[#12121a] px-2 py-1.5 font-mono text-[10px] text-white placeholder:text-[#5a5a78]"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!!busy || !contextualQ.trim()}
            onClick={() => void runContextual()}
            className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-2.5 py-1.5 text-[11px] text-[#D4AF37] disabled:opacity-40"
            aria-label="Ask Knights with contextual help"
          >
            {busy === 'contextual' ? 'Asking…' : 'Ask Knights (contextual)'}
          </button>
          {suggested && (
            <button
              type="button"
              disabled={!!busy || !hasClient}
              onClick={() => void applySuggestedAndSend()}
              className="rounded-lg border border-[#22c55e] px-2.5 py-1.5 text-[11px] text-white disabled:opacity-40"
              aria-label="Send contextual answer and apply suggested panel"
            >
              Send answer + apply panel
            </button>
          )}
        </div>
        {suggested && suggested.suggestedDirectives.length > 0 && (
          <p className="mt-2 text-[10px] text-[#a0a0b8]">
            Suggested:{' '}
            {suggested.suggestedDirectives
              .map((d) => d.type + (d.panelId ? `:${d.panelId}` : ''))
              .join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}
