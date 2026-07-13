'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { getPanel } from '@/lib/help-panels'

interface ArticleListItem {
  id: string
  slug: string
  title: string
  excerpt: string
  tags: string[]
  panelId: string | null
  updatedAt: string
}

interface ArticleDetail {
  id: string
  slug: string
  title: string
  body: string
  tags: string[]
  panelId: string | null
  updatedAt: string
}

async function listFetcher(url: string): Promise<ArticleListItem[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as {
    success: boolean
    data?: ArticleListItem[]
    error?: string
  }
  if (!body.success || !body.data) throw new Error(body.error ?? 'Load failed')
  return body.data
}

function readUrlState(): { q: string; slug: string | null; panel: string | null } {
  if (typeof window === 'undefined') return { q: '', slug: null, panel: null }
  const sp = new URLSearchParams(window.location.search)
  return {
    q: sp.get('q')?.trim() ?? '',
    slug: sp.get('slug')?.trim() || null,
    panel: sp.get('panel')?.trim() || null,
  }
}

function writeUrlState(next: { q: string; slug: string | null; panel: string | null }) {
  const sp = new URLSearchParams()
  if (next.q.trim()) sp.set('q', next.q.trim())
  if (next.slug) sp.set('slug', next.slug)
  if (next.panel) sp.set('panel', next.panel)
  const qs = sp.toString()
  const url = qs ? `/help-center?${qs}` : '/help-center'
  window.history.replaceState(null, '', url)
}

/** Property deep-link path the install can honor (open_panel / navigate). */
function panelDeepLink(panelId: string, slug?: string): string {
  const params = new URLSearchParams({ panel: panelId })
  if (slug) params.set('help', slug)
  return `/app?${params.toString()}`
}

function PanelDeepLinkChip({
  panelId,
  slug,
}: {
  panelId: string
  slug?: string
}) {
  const panel = getPanel(panelId)
  const label = panel?.label ?? panelId
  const deep = panelDeepLink(panelId, slug)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(deep)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge level="ok" label={`◆ Open panel · ${label}`} />
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-full border border-[#2a2a3f] px-2 py-0.5 font-mono text-[10px] text-[#D4AF37] hover:border-[#D4AF37]"
        aria-label={`Copy deep link for panel ${label}`}
      >
        {copied ? '✓ Copied' : `Copy ${deep}`}
      </button>
      <a
        href={deep}
        className="text-[10px] text-[#a0a0b8] underline"
        aria-label={`Deep link path for ${label} (property app)`}
      >
        Property deep-link
      </a>
    </div>
  )
}

export function HelpCenterLite() {
  const [q, setQ] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [panelFilter, setPanelFilter] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const fromUrl = readUrlState()
    setQ(fromUrl.q)
    setSlug(fromUrl.slug)
    setPanelFilter(fromUrl.panel)
    setReady(true)
  }, [])

  const syncUrl = useCallback(
    (next: { q: string; slug: string | null; panel: string | null }) => {
      writeUrlState(next)
    },
    []
  )

  const { data, error, isLoading } = useSWR(
    ready
      ? `/api/help-center${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`
      : null,
    listFetcher,
    { keepPreviousData: true }
  )

  const filtered = (data ?? []).filter((a) =>
    panelFilter ? a.panelId === panelFilter : true
  )

  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
  } = useSWR(
    slug && ready ? `/api/help-center?slug=${encodeURIComponent(slug)}` : null,
    async (url: string) => {
      const res = await fetch(url, { cache: 'no-store' })
      const body = (await res.json()) as {
        success: boolean
        data?: ArticleDetail
        error?: string
      }
      if (!body.success || !body.data) throw new Error(body.error ?? 'Not found')
      return body.data
    }
  )

  function openArticle(nextSlug: string) {
    setSlug(nextSlug)
    syncUrl({ q, slug: nextSlug, panel: panelFilter })
  }

  function backToList() {
    setSlug(null)
    syncUrl({ q, slug: null, panel: panelFilter })
  }

  function onSearch(value: string) {
    setQ(value)
    syncUrl({ q: value, slug, panel: panelFilter })
  }

  function togglePanelFilter(id: string | null) {
    const next = panelFilter === id ? null : id
    setPanelFilter(next)
    syncUrl({ q, slug, panel: next })
  }

  const panelOptions = Array.from(
    new Set((data ?? []).map((a) => a.panelId).filter((p): p is string => Boolean(p)))
  ).sort()

  if (slug) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={backToList}
          className="text-xs text-[#D4AF37] underline"
          aria-label="Back to article list"
        >
          ← All articles
        </button>
        {detailLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-[#12121a]" aria-hidden />
        ) : null}
        {detailError ? (
          <p className="text-sm text-[#a0a0b8]">
            <span aria-label="Error">✕</span> {detailError.message}
          </p>
        ) : null}
        {detail ? (
          <article className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-5">
            <h2 className="text-lg font-semibold text-white">{detail.title}</h2>
            <p className="mt-1 font-mono text-[10px] text-[#5a5a78]">
              {detail.slug} · updated {new Date(detail.updatedAt).toLocaleDateString()}
            </p>
            {detail.panelId ? (
              <div className="mt-3">
                <PanelDeepLinkChip panelId={detail.panelId} slug={detail.slug} />
              </div>
            ) : null}
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#a0a0b8]">
              {detail.body}
            </div>
            {detail.tags.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                {detail.tags.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-[#2a2a3f] px-2 py-0.5 text-[10px] text-[#5a5a78]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-widest text-[#D4AF37]" htmlFor="hc-q">
        Search
      </label>
      <input
        id="hc-q"
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="BEO, login, schedule…"
        className="w-full rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
        aria-label="Search help articles"
      />

      {panelOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by panel deep-link">
          <button
            type="button"
            onClick={() => togglePanelFilter(null)}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              !panelFilter
                ? 'border-[#D4AF37] text-[#D4AF37]'
                : 'border-[#2a2a3f] text-[#5a5a78]'
            }`}
            aria-pressed={!panelFilter}
            aria-label="Show all panels"
          >
            All panels
          </button>
          {panelOptions.map((id) => {
            const p = getPanel(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => togglePanelFilter(id)}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  panelFilter === id
                    ? 'border-[#D4AF37] text-[#D4AF37]'
                    : 'border-[#2a2a3f] text-[#a0a0b8]'
                }`}
                aria-pressed={panelFilter === id}
                aria-label={`Filter articles for panel ${p?.label ?? id}`}
              >
                ◆ {p?.label ?? id}
              </button>
            )
          })}
        </div>
      ) : null}

      {isLoading && !data ? (
        <div className="h-24 animate-pulse rounded-xl bg-[#12121a]" aria-hidden />
      ) : null}
      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : null}

      {data && filtered.length === 0 ? (
        <p className="text-sm text-[#5a5a78]">
          <span aria-label="Empty">○</span> No public articles
          {panelFilter ? ' for this panel' : ' yet'}. Operators can mark Help Files as public.
        </p>
      ) : null}

      <ul className="space-y-2">
        {filtered.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => openArticle(a.slug)}
              className="w-full rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4 text-left transition-colors hover:border-[#D4AF37]"
              aria-label={`Open article ${a.title}`}
            >
              <span className="text-sm font-medium text-white">{a.title}</span>
              <p className="mt-1 line-clamp-2 text-xs text-[#a0a0b8]">{a.excerpt}</p>
              {a.panelId ? (
                <p className="mt-2 font-mono text-[10px] text-[#D4AF37]">
                  ◆ Panel · {getPanel(a.panelId)?.label ?? a.panelId} ·{' '}
                  <span className="text-[#5a5a78]">{panelDeepLink(a.panelId, a.slug)}</span>
                </p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
