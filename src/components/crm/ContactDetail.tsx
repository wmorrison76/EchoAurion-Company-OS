'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft } from 'lucide-react'
import { isUnauthorized } from '@/lib/fetchers'
import { KPICard } from '@/components/ui/KPICard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { OutreachTimeline } from './OutreachTimeline'
import { DealForm } from './DealForm'
import { OUTREACH_CHANNELS } from '@/types/crm'
import type { APIResponse } from '@/types'
import type { ContactDetail as Detail, OutreachChannel } from '@/types/crm'

async function fetcher(url: string): Promise<Detail> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) {
    const err = new Error('Unauthorized')
    err.name = 'UnauthorizedError'
    throw err
  }
  const body = (await res.json()) as APIResponse<Detail>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const inputCls =
  'w-full rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]'

export function ContactDetail({ id }: { id: string }) {
  const router = useRouter()
  const { data, error, mutate } = useSWR(`/api/crm/contacts/${id}`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (error?.name === 'UnauthorizedError' || isUnauthorized(error)) router.replace('/login')
  }, [error, router])

  if (error && error.name !== 'UnauthorizedError') {
    return (
      <p className="text-sm text-[#a0a0b8]">
        Could not load contact: {error instanceof Error ? error.message : 'error'}
      </p>
    )
  }
  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const display = data.company ?? `${data.firstName} ${data.lastName}`.trim()

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/crm"
        className="inline-flex items-center gap-1 text-xs text-[#a0a0b8] hover:text-white"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to pipeline
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KPICard title="Contact">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-white">{display}</p>
            <p className="text-sm text-[#a0a0b8]">
              {`${data.firstName} ${data.lastName}`.trim()}
              {data.title ? ` · ${data.title}` : ''}
            </p>
            <dl className="mt-1 grid grid-cols-[5rem_1fr] gap-y-1 text-xs">
              {data.email ? (
                <>
                  <dt className="text-[#5a5a78]">Email</dt>
                  <dd className="text-white">{data.email}</dd>
                </>
              ) : null}
              {data.phone ? (
                <>
                  <dt className="text-[#5a5a78]">Phone</dt>
                  <dd className="text-white">{data.phone}</dd>
                </>
              ) : null}
              {data.linkedIn ? (
                <>
                  <dt className="text-[#5a5a78]">LinkedIn</dt>
                  <dd className="truncate text-white">{data.linkedIn}</dd>
                </>
              ) : null}
            </dl>
            {data.tags.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {data.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-[#2a2a3f] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#a0a0b8]"
                  >
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            ) : null}
            <NotesEditor id={id} initial={data.notes ?? ''} />
          </div>
        </KPICard>

        <KPICard title="Deal">
          {data.deals.length === 0 ? (
            <p className="text-sm text-[#a0a0b8]">No deal yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.deals.map((deal) => (
                <DealForm key={deal.id} deal={deal} onSaved={() => mutate()} />
              ))}
            </div>
          )}
        </KPICard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KPICard title="Log Outreach">
          <AddOutreach contactId={id} onAdded={() => mutate()} />
        </KPICard>
        <KPICard title="Outreach Timeline">
          <OutreachTimeline outreach={data.outreach} />
        </KPICard>
      </div>
    </div>
  )
}

function NotesEditor({ id, initial }: { id: string; initial: string }) {
  const [notes, setNotes] = useState(initial)
  const [saved, setSaved] = useState(false)

  async function save() {
    try {
      await fetch(`/api/crm/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch {
      /* best-effort auto-save */
    }
  }

  return (
    <label className="mt-2 flex flex-col gap-1 text-xs text-[#a0a0b8]">
      <span className="flex items-center justify-between">
        Notes {saved ? <span className="text-[#D4AF37]">saved</span> : null}
      </span>
      <textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        aria-label="Contact notes (auto-saved on blur)"
        className={`${inputCls} resize-y`}
      />
    </label>
  )
}

function AddOutreach({ contactId, onAdded }: { contactId: string; onAdded: () => void }) {
  const [channel, setChannel] = useState<OutreachChannel>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sentAt, setSentAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          channel,
          subject: subject || undefined,
          body: body || undefined,
          sentAt: new Date(sentAt).toISOString(),
        }),
      })
      const b = (await res.json()) as APIResponse<unknown>
      if (!b.success) throw new Error(b.error)
      setSubject('')
      setBody('')
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log outreach')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
          Channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as OutreachChannel)}
            className={inputCls}
            aria-label="Outreach channel"
          >
            {OUTREACH_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
          Date
          <input
            type="date"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
            className={inputCls}
            aria-label="Outreach date"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
        Subject
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputCls}
          aria-label="Outreach subject"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
        Body
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${inputCls} resize-y`}
          aria-label="Outreach body"
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-white">
          <span aria-hidden="true">✕</span> {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="self-start rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:opacity-60"
      >
        {saving ? 'Logging…' : 'Log outreach'}
      </button>
    </div>
  )
}
