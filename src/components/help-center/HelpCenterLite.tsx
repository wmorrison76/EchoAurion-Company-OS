'use client'

import { useState } from 'react'
import useSWR from 'swr'

interface ArticleListItem {
  id: string
  slug: string
  title: string
  excerpt: string
  tags: string[]
  updatedAt: string
}

interface ArticleDetail {
  id: string
  slug: string
  title: string
  body: string
  tags: string[]
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

export function HelpCenterLite() {
  const [q, setQ] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const { data, error, isLoading } = useSWR(
    `/api/help-center${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
    listFetcher,
    { keepPreviousData: true }
  )
  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
  } = useSWR(
    slug ? `/api/help-center?slug=${encodeURIComponent(slug)}` : null,
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

  if (slug) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSlug(null)}
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
        onChange={(e) => setQ(e.target.value)}
        placeholder="BEO, login, schedule…"
        className="w-full rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white placeholder:text-[#5a5a78] focus:border-[#D4AF37] focus:outline-none"
        aria-label="Search help articles"
      />

      {isLoading && !data ? (
        <div className="h-24 animate-pulse rounded-xl bg-[#12121a]" aria-hidden />
      ) : null}
      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : null}

      {data && data.length === 0 ? (
        <p className="text-sm text-[#5a5a78]">
          <span aria-label="Empty">○</span> No public articles yet. Operators can mark Help Files as
          public.
        </p>
      ) : null}

      <ul className="space-y-2">
        {(data ?? []).map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setSlug(a.slug)}
              className="w-full rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4 text-left transition-colors hover:border-[#D4AF37]"
              aria-label={`Open article ${a.title}`}
            >
              <span className="text-sm font-medium text-white">{a.title}</span>
              <p className="mt-1 line-clamp-2 text-xs text-[#a0a0b8]">{a.excerpt}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
