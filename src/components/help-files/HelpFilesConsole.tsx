'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { HELP_PANELS } from '@/lib/help-panels'
import type { APIResponse } from '@/types'
import type { HelpArticleView } from '@/types/help-files'

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

export function HelpFilesConsole() {
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [panelId, setPanelId] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [isMacro, setIsMacro] = useState(false)

  const listUrl = q.trim()
    ? `/api/help-files/search?q=${encodeURIComponent(q.trim())}`
    : '/api/help-files'

  const { data: articles, error: listError, mutate, isLoading } = useSWR(
    listUrl,
    jsonFetcher<HelpArticleView[]>,
    { refreshInterval: 60_000 }
  )

  const selected = useMemo(
    () => articles?.find((a) => a.id === selectedId) ?? null,
    [articles, selectedId]
  )

  function loadIntoForm(a: HelpArticleView | null) {
    if (!a) {
      setTitle('')
      setSlug('')
      setBody('')
      setTags('')
      setPanelId('')
      setIsPublic(false)
      setIsMacro(false)
      return
    }
    setTitle(a.title)
    setSlug(a.slug)
    setBody(a.body)
    setTags(a.tags.join(', '))
    setPanelId(a.panelId ?? '')
    setIsPublic(a.public === true)
    setIsMacro(a.isMacro === true)
  }

  function startNew() {
    setSelectedId(null)
    loadIntoForm(null)
    setEditing(true)
  }

  function startEdit(a: HelpArticleView) {
    setSelectedId(a.id)
    loadIntoForm(a)
    setEditing(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        id: selectedId ?? undefined,
        title: title.trim(),
        slug: slug.trim() || undefined,
        body: body.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        panelId: panelId || null,
        public: isPublic,
        isMacro,
      }
      const res = await fetch('/api/help-files', {
        method: selectedId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as APIResponse<HelpArticleView>
      if (!json.success) throw new Error(json.error)
      setSelectedId(json.data.id)
      setEditing(false)
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Help File / Knowledge Base</p>
        <p className="mt-1 text-sm text-[#a0a0b8]">
          Searchable macros Knights can cite and operators can send to the client. Optional panelId
          opens that panel when the article is sent.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles…"
          aria-label="Search help articles"
          className="min-w-[200px] flex-1 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
        />
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2 text-xs text-[#D4AF37]"
          aria-label="New help article"
        >
          New article
        </button>
      </div>

      {error && (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error}
        </p>
      )}
      {listError && (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {listError.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section
          className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-3 lg:col-span-5"
          aria-label="Help article list"
        >
          {isLoading && !articles && (
            <div className="h-40 animate-pulse rounded-lg bg-[#1a1a26]" />
          )}
          {articles?.length === 0 && (
            <p className="p-4 text-sm text-[#a0a0b8]">No articles yet. Create one or run seed.</p>
          )}
          <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
            {articles?.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(a.id)
                    loadIntoForm(a)
                    setEditing(false)
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition-colors duration-150 ${
                    selectedId === a.id
                      ? 'border-[#D4AF37] bg-[#1a1a26]'
                      : 'border-[#2a2a3f] bg-[#0a0a0f] hover:border-[#3a3a55]'
                  }`}
                  aria-label={`Open article ${a.title}`}
                  aria-current={selectedId === a.id ? 'true' : undefined}
                >
                  <p className="text-sm font-medium text-white">{a.title}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                    {a.slug}
                    {a.panelId ? ` · panel ${a.panelId}` : ''} · {ago(a.updatedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.public ? <StatusBadge level="ok" label="○ Public" /> : null}
                    {a.isMacro ? <StatusBadge level="unknown" label="▣ Macro" /> : null}
                    {a.tags.slice(0, 4).map((t) => (
                      <StatusBadge key={t} level="unknown" label={t} />
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4 lg:col-span-7"
          aria-label="Help article editor"
        >
          {!selected && !editing && (
            <p className="text-sm text-[#a0a0b8]">Select an article or create a new one.</p>
          )}

          {(selected || editing) && (
            <>
              {!editing && selected && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-white">{selected.title}</h2>
                      <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
                        {selected.slug}
                        {selected.panelId ? ` · opens ${selected.panelId}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(selected)}
                      className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
                      aria-label="Edit article"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selected.public ? <StatusBadge level="ok" label="○ Public · Help Center" /> : null}
                    {selected.isMacro ? <StatusBadge level="unknown" label="▣ Macro library" /> : null}
                    {selected.tags.map((t) => (
                      <StatusBadge key={t} level="unknown" label={t} />
                    ))}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[#a0a0b8]">{selected.body}</p>
                </>
              )}

              {editing && (
                <>
                  <label className="text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hf-title">
                    Title
                  </label>
                  <input
                    id="hf-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    aria-label="Article title"
                  />
                  <label className="text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hf-slug">
                    Slug
                  </label>
                  <input
                    id="hf-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="auto from title if empty"
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 font-mono text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    aria-label="Article slug"
                  />
                  <label className="text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hf-body">
                    Body
                  </label>
                  <textarea
                    id="hf-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    aria-label="Article body"
                  />
                  <label className="text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hf-tags">
                    Tags (comma-separated)
                  </label>
                  <input
                    id="hf-tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    aria-label="Article tags"
                  />
                  <label className="text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hf-panel">
                    Open panel (optional)
                  </label>
                  <select
                    id="hf-panel"
                    value={panelId}
                    onChange={(e) => setPanelId(e.target.value)}
                    className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    aria-label="Optional panel to open"
                  >
                    <option value="">None</option>
                    {HELP_PANELS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({p.id})
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-4" role="group" aria-label="Article visibility flags">
                    <label className="flex items-center gap-2 text-sm text-[#a0a0b8]">
                      <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        aria-label="Public on Help Center"
                        className="rounded border-[#2a2a3f]"
                      />
                      <span>○ Public (Help Center)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#a0a0b8]">
                      <input
                        type="checkbox"
                        checked={isMacro}
                        onChange={(e) => setIsMacro(e.target.checked)}
                        aria-label="Include in macro library"
                        className="rounded border-[#2a2a3f]"
                      />
                      <span>▣ Macro library</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !title.trim() || !body.trim()}
                      onClick={() => void save()}
                      className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-4 py-2 text-xs text-[#D4AF37] disabled:opacity-40"
                      aria-label="Save help article"
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false)
                        if (selected) loadIntoForm(selected)
                      }}
                      className="rounded-lg border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8]"
                      aria-label="Cancel edit"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
