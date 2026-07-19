'use client'

import Link from 'next/link'
import { Brain, DollarSign, Headset, Radar } from 'lucide-react'

const LINKS = [
  {
    href: '/fleet-nexus',
    label: 'Fleet',
    description: 'Ops map · costs',
    icon: Radar,
  },
  {
    href: '/help-desk',
    label: 'Help Desk',
    description: 'Tickets · Knights',
    icon: Headset,
  },
  {
    href: '/financial',
    label: 'Financial',
    description: 'Balances · burn',
    icon: DollarSign,
  },
  {
    href: '/knowledge-plane',
    label: 'Knowledge',
    description: 'Learning plane',
    icon: Brain,
  },
] as const

/**
 * Nerve-center deep links — one-tap jump from Dr. OS to primary ops surfaces.
 * Icon + label always (colorblind / mobile).
 */
export function NerveCenterLinks() {
  return (
    <nav
      aria-label="Nerve center deep links"
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
        Nerve center
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LINKS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-label={`Open ${label}: ${description}`}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2.5 transition-colors duration-150 hover:border-[#D4AF37] hover:bg-[#1a1a26]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{label}</span>
                <span className="block truncate text-[10px] text-[#5a5a78]">
                  {description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
