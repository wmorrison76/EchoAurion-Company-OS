'use client'

import { KPICard } from '@/components/ui/KPICard'
import {
  CHARGE_CATEGORIES,
  FREE_CATEGORIES,
  SUPPORT_ANSWER_SLA,
} from '@/lib/support-policy'

/** Compact Free vs Charge legend for the Support console. */
export function SupportPolicyCard() {
  return (
    <KPICard title="Support Policy">
      <p className="mb-4 text-sm text-[#a0a0b8]">{SUPPORT_ANSWER_SLA}</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-labelledby="policy-free-heading">
          <h3 id="policy-free-heading" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
            <span aria-hidden="true" className="font-mono text-[#22c55e]">
              ✓
            </span>
            Free
          </h3>
          <ul className="flex flex-col gap-2">
            {FREE_CATEGORIES.map((c) => (
              <li key={c.id} className="text-xs text-[#a0a0b8]">
                <span className="text-white">{c.label}</span>
                <span className="block text-[11px] text-[#5a5a78]">{c.examples}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="policy-charge-heading">
          <h3 id="policy-charge-heading" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#D4AF37]">
            <span aria-hidden="true" className="font-mono text-[#f59e0b]">
              $
            </span>
            Charge
          </h3>
          <ul className="flex flex-col gap-2">
            {CHARGE_CATEGORIES.map((c) => (
              <li key={c.id} className="text-xs text-[#a0a0b8]">
                <span className="text-white">{c.label}</span>
                <span className="block text-[11px] text-[#5a5a78]">{c.examples}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-4 border-t border-[#2a2a3f] pt-3 text-[11px] text-[#5a5a78]">
        <span aria-hidden="true">◇</span> Chips on each request are guidance only — your{' '}
        <span className="text-[#a0a0b8]">Approve free</span> /{' '}
        <span className="text-[#a0a0b8]">Send quote</span> buttons decide. Full matrix:{' '}
        <code className="font-mono text-[#5a5a78]">SUPPORT_POLICY.md</code>
      </p>
    </KPICard>
  )
}
