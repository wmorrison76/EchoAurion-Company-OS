import { StatusBadge } from '@/components/ui/StatusBadge'
import Link from 'next/link'

export const metadata = {
  title: 'Trust · EchoAurion',
  description:
    'How EchoAurion protects property ops: handshake auth, draft-PR-only code repair, canary rollout, and data retention.',
  robots: { index: true, follow: true },
}

/**
 * Public trust page — SOC2-prep marketing.
 * No secrets, no tenant PII, no live metrics that could leak ops posture beyond policy.
 */
export default function TrustPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">EchoAurion</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Trust</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#a0a0b8]">
          How we protect hospitality multi-property tech ops — before a formal SOC 2 badge. Controls
          below are how the product actually runs today.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge level="ok" label="✓ Handshake auth" />
          <StatusBadge level="ok" label="✓ Draft-PR only" />
          <StatusBadge level="ok" label="✓ Canary then fleet" />
          <StatusBadge level="ok" label="○ Retention policy" />
        </div>

        <section className="mt-8 space-y-6" aria-label="Trust controls">
          <article className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-5">
            <h2 className="text-sm font-semibold text-[#D4AF37]">1 · Triple-layer handshake</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a0a0b8]">
              Property ↔ Company OS relay uses three layers: shared secret / HMAC, tenant{' '}
              <span className="font-mono text-[12px] text-white">clientKey</span> binding, and
              request timestamp + nonce (replay rejected). Secrets stay server-side — never in the
              browser bundle.
            </p>
            <p className="mt-2 text-[11px] text-[#5a5a78]">
              Shape + label: ✓ Authenticated relay · ✕ Replay rejected · ⚠ Soft handshake until
              required flag
            </p>
          </article>

          <article className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-5">
            <h2 className="text-sm font-semibold text-[#D4AF37]">2 · Draft-PR-only code repair</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a0a0b8]">
              Automated remediation produces a <strong className="font-medium text-white">draft
              plan / draft GitHub PR</strong> only. Merge is always human or CI — never silent
              autopilot. Core product paths require human review before any merge.
            </p>
            <p className="mt-2 text-[11px] text-[#5a5a78]">
              Constitution: pr_only_code · no silent merge
            </p>
          </article>

          <article className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-5">
            <h2 className="text-sm font-semibold text-[#D4AF37]">3 · Canary, then fleet</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a0a0b8]">
              Fleet-wide notify for fixes is gated: operators set canary{' '}
              <span className="font-mono text-[12px] text-white">clientKey</span>s first, then
              promote to fleet. Client-claimed “GLOBAL” or canary hijacks are capped — canary keys
              are operator-set only.
            </p>
            <p className="mt-2 text-[11px] text-[#5a5a78]">
              Stages: ○ unset · ◎ canary · ■ fleet
            </p>
          </article>

          <article className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-5">
            <h2 className="text-sm font-semibold text-[#D4AF37]">4 · Retention &amp; isolation</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[#a0a0b8]">
              <li>
                <span aria-hidden>○</span> Request nonces: <strong className="text-white">24h</strong>{' '}
                TTL
              </li>
              <li>
                <span aria-hidden>○</span> Knowledge signals: recommend{' '}
                <strong className="text-white">90 days</strong>
              </li>
              <li>
                <span aria-hidden>○</span> Audit log: recommend{' '}
                <strong className="text-white">≥ 1 year</strong> (SOC-oriented)
              </li>
              <li>
                <span aria-hidden>○</span> Tenant knowledge never auto-promotes to fleet; guest PII
                keys rejected on ingest
              </li>
            </ul>
          </article>
        </section>

        <p className="mt-8 text-xs text-[#5a5a78]">
          This page describes product controls — not a SOC 2 / ISO attestation. Formal audit is a
          separate process. For property how-tos see{' '}
          <Link href="/help-center" className="text-[#D4AF37] underline" aria-label="Help Center">
            Help Center
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
