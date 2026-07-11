import Link from 'next/link'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { NotifyButton } from '@/components/pwa/NotifyButton'

export const metadata = {
  title: 'Install Dr. OS · EchoAurion Company OS',
}

/**
 * iPhone 15 Add to Home Screen guide — PWA is Phase 1 (no App Store).
 * Capacitor native wrapper is Phase 2.
 */
export default function InstallPage() {
  return (
    <AppShell
      title="Install Dr. OS"
      subtitle="iPhone 15 · Safari · Add to Home Screen (PWA)"
      actions={
        <Link
          href="/lab/echo-chrome"
          className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
          aria-label="Open Echo chrome lab"
        >
          Echo chrome lab
        </Link>
      }
    >
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <section className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-5">
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Phase 1 · today</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Installable PWA on iPhone 15</h2>
          <p className="mt-2 text-sm text-[#a0a0b8]">
            No App Store required. Safari installs EchoAurion Dr. OS as a standalone home-screen app
            (`display: standalone`, theme <code className="font-mono text-[#D4AF37]">#0a0a0f</code>).
          </p>
          <p className="mt-3 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-xs text-[#5a5a78]">
            <span className="text-[#a0a0b8]">Phase 2:</span> native App Store wrapper via Capacitor —
            not started. Use this PWA until then.
          </p>
        </section>

        <ol className="flex flex-col gap-4">
          <Step n={1} title="Open in Safari">
            On your iPhone 15, open this site in <strong className="font-medium text-white">Safari</strong>{' '}
            (not Chrome in-app browsers). Sign in to Company OS first.
          </Step>
          <Step n={2} title="Share → Add to Home Screen">
            Tap the <strong className="font-medium text-white">Share</strong> button (square with ↑),
            scroll, then tap <strong className="font-medium text-white">Add to Home Screen</strong>.
            Name it <span className="font-mono text-[#D4AF37]">Dr. OS</span> if prompted, then Add.
          </Step>
          <Step n={3} title="Launch from the home screen">
            Open the new icon. It should launch full-screen without Safari chrome (standalone).
            Start URL is <code className="font-mono text-[#a0a0b8]">/dr-os</code>.
          </Step>
          <Step n={4} title="Enable Notify">
            In the app (or below), enable alerts so Help Desk / questions ping this phone. Needs
            VAPID keys on the server.
            <div className="mt-3">
              <NotifyButton />
            </div>
          </Step>
        </ol>

        <section className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
            Mobile polish (390px)
          </h3>
          <ul className="mt-3 space-y-2 text-xs text-[#a0a0b8]">
            <li>· Sidebar collapses to hamburger — bottom-friendly primary actions stay in content</li>
            <li>
              ·{' '}
              <Link href="/help-desk" className="text-[#D4AF37] underline">
                Help Desk
              </Link>{' '}
              and{' '}
              <Link href="/dr-os" className="text-[#D4AF37] underline">
                Dr. OS
              </Link>{' '}
              are usable at iPhone width
            </li>
            <li>
              · Lab chrome at{' '}
              <Link href="/lab/echo-chrome" className="text-[#D4AF37] underline">
                /lab/echo-chrome
              </Link>{' '}
              uses a slide-over sized for one-thumb close
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37] font-mono text-sm text-[#D4AF37]"
        aria-hidden="true"
      >
        {n}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="mt-1 text-sm leading-relaxed text-[#a0a0b8]">{children}</div>
      </div>
    </li>
  )
}
