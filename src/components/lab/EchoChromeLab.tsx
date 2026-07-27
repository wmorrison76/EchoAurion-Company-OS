'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Wrench, X, Headset } from 'lucide-react'
import { COMPLEXITY_TIERS, computeQuote, formatUSD, type ComplexityTier } from '@/lib/pricing'
import {
  PILOT_ROLES,
  canRequestBuild,
  buildRoleGateMessage,
  type PilotRole,
} from '@/lib/work-roles'
import type { APIResponse } from '@/types'
import type { Quote } from '@/lib/pricing'

type Panel = 'none' | 'help' | 'profile'
type HelpTab = 'tech' | 'build'

interface MockProfile {
  name: string
  email: string
  role: PilotRole
}

const DEFAULT_PROFILE: MockProfile = {
  name: 'William Morrison',
  email: 'william@echoaurion.com',
  role: 'EXEC',
}

export function EchoChromeLab() {
  const [profile, setProfile] = useState<MockProfile>(DEFAULT_PROFILE)
  const [panel, setPanel] = useState<Panel>('none')
  const [tab, setTab] = useState<HelpTab>('tech')

  // Tech support
  const [question, setQuestion] = useState('')
  const [techDraft, setTechDraft] = useState<string | null>(null)
  const [techBusy, setTechBusy] = useState<string | null>(null)
  const [techResult, setTechResult] = useState<string | null>(null)
  const [techError, setTechError] = useState<string | null>(null)

  // Build
  const [buildTitle, setBuildTitle] = useState('')
  const [buildDetail, setBuildDetail] = useState('')
  const [tier, setTier] = useState<ComplexityTier>('T2')
  const [agreed, setAgreed] = useState(false)
  const [typedSignature, setTypedSignature] = useState('')
  const [buildBusy, setBuildBusy] = useState<string | null>(null)
  const [buildResult, setBuildResult] = useState<string | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [lastWorkId, setLastWorkId] = useState<string | null>(null)

  const quote: Quote = useMemo(() => computeQuote(tier), [tier])
  const buildAllowed = canRequestBuild(profile.role)

  async function runTech(opts: { askKnights: boolean; send: boolean }) {
    if (!question.trim()) return
    setTechBusy(opts.send ? 'send' : opts.askKnights ? 'knights' : 'create')
    setTechError(null)
    setTechResult(null)
    try {
      const res = await fetch('/api/lab/echo-chrome/tech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          profileName: profile.name,
          profileRole: profile.role,
          profileEmail: profile.email,
          askKnights: opts.askKnights,
          send: opts.send,
        }),
      })
      const body = (await res.json()) as APIResponse<{
        ticket: { id: string }
        draft: string | null
        draftError: string | null
        outboxEventId: string | null
        helpDeskUrl: string
      }>
      if (!body.success) throw new Error(body.error)
      if (body.data.draft) setTechDraft(body.data.draft)
      if (body.data.draftError && !body.data.draft) {
        setTechDraft(`(Draft unavailable: ${body.data.draftError})`)
      }
      const bits = [
        `Ticket ${body.data.ticket.id.slice(0, 8)}…`,
        body.data.outboxEventId ? `outbox ${body.data.outboxEventId.slice(0, 8)}…` : null,
      ].filter(Boolean)
      setTechResult(`${bits.join(' · ')} — open Help Desk`)
      return body.data.helpDeskUrl
    } catch (e) {
      setTechError(e instanceof Error ? e.message : 'Tech support failed')
      return null
    } finally {
      setTechBusy(null)
    }
  }

  async function submitBuild() {
    setBuildBusy('submit')
    setBuildError(null)
    setBuildResult(null)
    try {
      const res = await fetch('/api/lab/echo-chrome/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: buildTitle.trim(),
          detail: buildDetail.trim(),
          tier,
          profileName: profile.name,
          profileRole: profile.role,
          profileEmail: profile.email,
          agreed,
          typedSignature,
        }),
      })
      const body = (await res.json()) as APIResponse<{
        workRequestId: string
        agreementId: string
        quote: Quote
        helpDeskUrl: string
        status: string
      }>
      if (!body.success) throw new Error(body.error)
      setLastWorkId(body.data.workRequestId)
      setBuildResult(
        `Work ${body.data.workRequestId.slice(0, 8)}… · ${body.data.status} · agreement ${body.data.agreementId.slice(0, 8)}… · ${formatUSD(body.data.quote.total)}`
      )
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'Build submit failed')
    } finally {
      setBuildBusy(null)
    }
  }

  async function authorizeBuild() {
    if (!lastWorkId) return
    setBuildBusy('authorize')
    setBuildError(null)
    try {
      const res = await fetch('/api/lab/echo-chrome/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workRequestId: lastWorkId }),
      })
      const body = (await res.json()) as APIResponse<{ status: string; customerApprover: string }>
      if (!body.success) throw new Error(body.error)
      setBuildResult((prev) => `${prev ?? ''} → ${body.data.status} by ${body.data.customerApprover}`)
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'Authorize failed')
    } finally {
      setBuildBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mock product chrome */}
      <section
        className="relative overflow-hidden rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f]"
        aria-label="Mock product top chrome"
      >
        <div className="flex items-center justify-between border-b border-[#2a2a3f] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">Lab mock · product chrome</p>
            <p className="text-sm font-semibold text-white">
              Echo<span className="text-[#D4AF37]">Aurion</span> · property shell
            </p>
          </div>
          <div className="flex items-center gap-2" aria-label="Top-right chrome">
            {/* Help Desk — immediately LEFT of avatar */}
            <button
              type="button"
              aria-label="Open Help Desk"
              onClick={() => {
                setPanel('help')
                setTab('tech')
              }}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2a3f] bg-[#1a1a26] transition-colors duration-150 hover:border-[#D4AF37] hover:bg-[#22223a]"
            >
              <Image
                src="/help-desk-icon.png"
                alt=""
                width={28}
                height={28}
                className="rounded-md object-cover"
                aria-hidden="true"
              />
              <span className="sr-only">Help Desk</span>
            </button>
            <button
              type="button"
              aria-label="Open mock profile"
              onClick={() => setPanel('profile')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37] bg-[#1a1a26] text-xs font-semibold text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a]"
            >
              {profile.name
                .split(/\s+/)
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || 'EA'}
            </button>
          </div>
        </div>
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-[#a0a0b8]">
            Mini EchoAI avatar is on the far right. Help Desk icon sits immediately to its left —
            same placement the product should use when pilot wiring enables.
          </p>
        </div>
      </section>

      {/* Checklists */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChecklistCard
          title="What this proves"
          items={[
            'Help icon left of avatar chrome placement',
            'Tech vs Build visual split (headset vs wrench)',
            'Ask Knights draft + simulated outbox send',
            'Role gate blocks LINE; EXEC can build',
            'Quote preview from pricing.ts + typed agreement',
            'FEATURE ticket + WorkRequest + WorkAgreement land in Help Desk',
          ]}
        />
        <ChecklistCard
          title="What still needs pilot wiring"
          items={[
            'Product avatar/chrome mount on feat/company-os-relay-wiring',
            'Real product session profile (not lab mock selector)',
            'Pilot SSE delivery of outbox to property UI',
            'Native Capacitor App Store wrapper (Phase 2 — use /install PWA today)',
          ]}
        />
      </div>

      <p className="text-xs text-[#5a5a78]">
        Auth: Company OS NextAuth session. After submit, open{' '}
        <Link href="/help-desk" className="text-[#D4AF37] underline">
          Help Desk
        </Link>{' '}
        or{' '}
        <Link href="/support/inbox" className="text-[#D4AF37] underline">
          Inbox
        </Link>{' '}
        — filter clientKey <code className="font-mono text-[#a0a0b8]">lab-echo-chrome</code>.
      </p>

      {/* Slide-over / modal */}
      {panel !== 'none' ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="presentation">
          <button
            type="button"
            aria-label="Close panel backdrop"
            className="absolute inset-0 cursor-default"
            onClick={() => setPanel('none')}
          />
          <aside
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[#2a2a3f] bg-[#0a0a0f] shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={panel === 'help' ? 'Help Desk panel' : 'Mock profile panel'}
          >
            <div className="flex items-center justify-between border-b border-[#2a2a3f] px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                {panel === 'help' ? 'Help Desk' : 'Mock profile'}
              </h2>
              <button
                type="button"
                aria-label="Close panel"
                onClick={() => setPanel('none')}
                className="rounded-lg border border-[#2a2a3f] p-2 text-[#a0a0b8] hover:text-white"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
              {panel === 'profile' ? (
                <ProfileForm profile={profile} onChange={setProfile} />
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Segmented control */}
                  <div
                    className="grid grid-cols-2 gap-1 rounded-lg border border-[#2a2a3f] bg-[#12121a] p-1"
                    role="tablist"
                    aria-label="Help Desk mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'tech'}
                      aria-label="Tech support tab"
                      onClick={() => setTab('tech')}
                      className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                        tab === 'tech'
                          ? 'bg-[#1a1a26] text-[#D4AF37]'
                          : 'text-[#5a5a78] hover:text-[#a0a0b8]'
                      }`}
                    >
                      <Headset size={14} aria-hidden="true" />
                      Tech support
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'build'}
                      aria-label="Build request tab"
                      onClick={() => setTab('build')}
                      className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                        tab === 'build'
                          ? 'bg-[#1a1a26] text-[#D4AF37]'
                          : 'text-[#5a5a78] hover:text-[#a0a0b8]'
                      }`}
                    >
                      <Wrench size={14} aria-hidden="true" />
                      Build request
                    </button>
                  </div>

                  {tab === 'tech' ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-[#a0a0b8]">
                        Ask a question as <span className="text-white">{profile.name}</span> (
                        {profile.role}). Optional Knights draft, then Send simulates outbox.
                      </p>
                      <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
                        Question
                        <textarea
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          rows={4}
                          aria-label="Tech support question"
                          className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
                          placeholder="How do I re-print last night's BEO?"
                        />
                      </label>
                      {techDraft ? (
                        <div className="rounded-lg border border-[#2a2a3f] bg-[#12121a] p-3">
                          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">
                            Knights draft
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-[#a0a0b8]">{techDraft}</p>
                        </div>
                      ) : null}
                      {techError ? (
                        <p className="text-xs text-[#a0a0b8]">
                          <span aria-label="Error">✕</span> {techError}
                        </p>
                      ) : null}
                      {techResult ? (
                        <p className="text-xs text-[#22c55e]">
                          <span aria-label="Success">✓</span> {techResult}{' '}
                          <Link href="/help-desk" className="underline text-[#D4AF37]">
                            Open
                          </Link>
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          disabled={!!techBusy || !question.trim()}
                          onClick={() => void runTech({ askKnights: true, send: false })}
                          aria-label="Ask Knights for draft"
                          className="flex-1 rounded-lg border border-[#2a2a3f] px-3 py-2.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-40"
                        >
                          {techBusy === 'knights' ? 'Asking…' : 'Ask Knights draft'}
                        </button>
                        <button
                          type="button"
                          disabled={!!techBusy || !question.trim()}
                          onClick={() => void runTech({ askKnights: !!techDraft, send: true })}
                          aria-label="Send tech support reply to outbox"
                          className="flex-1 rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2.5 text-xs text-[#D4AF37] disabled:opacity-40"
                        >
                          {techBusy === 'send' ? 'Sending…' : 'Send (simulate outbox)'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {!buildAllowed ? (
                        <div
                          role="alert"
                          className="rounded-lg border border-[#f59e0b] bg-[#1a1a26] px-3 py-3 text-xs text-white"
                        >
                          <span aria-label="Warning">⚠</span> {buildRoleGateMessage(profile.role)}
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-[#a0a0b8]">
                            Paid path uses mock profile as signer. Quote from{' '}
                            <code className="font-mono text-[#D4AF37]">pricing.ts</code>.
                          </p>
                          <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
                            Title
                            <input
                              value={buildTitle}
                              onChange={(e) => setBuildTitle(e.target.value)}
                              aria-label="Build request title"
                              className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
                              placeholder="Add Send to kitchen on Print BEO"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
                            Detail
                            <textarea
                              value={buildDetail}
                              onChange={(e) => setBuildDetail(e.target.value)}
                              rows={3}
                              aria-label="Build request detail"
                              className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
                            Tier
                            <select
                              value={tier}
                              onChange={(e) => setTier(e.target.value as ComplexityTier)}
                              aria-label="Complexity tier"
                              className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
                            >
                              {COMPLEXITY_TIERS.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="rounded-lg border border-[#2a2a3f] bg-[#12121a] p-3">
                            <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">
                              Quote preview
                            </p>
                            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                              {formatUSD(quote.total)}
                            </p>
                            <p className="text-[11px] text-[#5a5a78]">
                              {quote.tier} · {quote.humanHours}h · floor {formatUSD(quote.floor)}
                            </p>
                          </div>
                          <label className="flex items-start gap-2 text-xs text-[#a0a0b8]">
                            <input
                              type="checkbox"
                              checked={agreed}
                              onChange={(e) => setAgreed(e.target.checked)}
                              aria-label="I agree to the work agreement and quote"
                              className="mt-0.5"
                            />
                            <span>
                              I agree to the work agreement and authorize spend of{' '}
                              <span className="font-mono text-white">{formatUSD(quote.total)}</span>{' '}
                              as <span className="text-white">{profile.name}</span> ({profile.role}).
                            </span>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
                            Type your name to sign
                            <input
                              value={typedSignature}
                              onChange={(e) => setTypedSignature(e.target.value)}
                              aria-label="Typed signature matching profile name"
                              className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
                              placeholder={profile.name}
                            />
                          </label>
                          {buildError ? (
                            <p className="text-xs text-[#a0a0b8]">
                              <span aria-label="Error">✕</span> {buildError}
                            </p>
                          ) : null}
                          {buildResult ? (
                            <p className="text-xs text-[#22c55e]">
                              <span aria-label="Success">✓</span> {buildResult}{' '}
                              <Link href="/help-desk" className="underline text-[#D4AF37]">
                                Help Desk
                              </Link>
                            </p>
                          ) : null}
                          <button
                            type="button"
                            disabled={
                              !!buildBusy ||
                              !buildTitle.trim() ||
                              !buildDetail.trim() ||
                              !agreed ||
                              !typedSignature.trim()
                            }
                            onClick={() => void submitBuild()}
                            aria-label="Submit build request with agreement"
                            className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2.5 text-xs text-[#D4AF37] disabled:opacity-40"
                          >
                            {buildBusy === 'submit' ? 'Submitting…' : 'Submit build + agreement'}
                          </button>
                          {lastWorkId ? (
                            <button
                              type="button"
                              disabled={!!buildBusy}
                              onClick={() => void authorizeBuild()}
                              aria-label="Simulate billing authorize with agreement"
                              className="rounded-lg border border-[#2a2a3f] px-3 py-2.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-40"
                            >
                              {buildBusy === 'authorize'
                                ? 'Authorizing…'
                                : 'Simulate authorize (requires agreement)'}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function ProfileForm({
  profile,
  onChange,
}: {
  profile: MockProfile
  onChange: (p: MockProfile) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#a0a0b8]">
        Mock product profile — change role to LINE to prove the build gate, then back to EXEC for
        paid agreement.
      </p>
      <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
        Name
        <input
          value={profile.name}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          aria-label="Mock profile name"
          className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
        Email
        <input
          type="email"
          value={profile.email}
          onChange={(e) => onChange({ ...profile, email: e.target.value })}
          aria-label="Mock profile email"
          className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#D4AF37]">
        Role
        <select
          value={profile.role}
          onChange={(e) => onChange({ ...profile, role: e.target.value as PilotRole })}
          aria-label="Mock profile role"
          className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-sm text-white"
        >
          {PILOT_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
              {canRequestBuild(r) ? ' · can build' : ' · tech only'}
            </option>
          ))}
        </select>
      </label>
      <p className="rounded-lg border border-[#2a2a3f] bg-[#12121a] px-3 py-2 text-[11px] text-[#5a5a78]">
        Build authorized:{' '}
        <span className="text-white">
          {canRequestBuild(profile.role) ? '✓ Yes (ADMIN/DIRECTOR/EXEC)' : '✕ No — blocked'}
        </span>
      </p>
    </div>
  )
}

function ChecklistCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs text-[#a0a0b8]">
            <span aria-hidden="true" className="text-[#D4AF37]">
              ·
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
