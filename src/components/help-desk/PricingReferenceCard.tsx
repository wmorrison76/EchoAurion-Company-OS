'use client'

import { TIERS, COMPLEXITY_TIERS, formatUSD, seniorRate, valueMultiplier } from '@/lib/pricing'
import { buildSpendCapUsd } from '@/lib/spend-cap-config'

/** Read-only display of billable change-request tiers from `src/lib/pricing.ts`. */
export function PricingReferenceCard() {
  const rate = seniorRate()
  const vm = valueMultiplier()
  const spendCap = buildSpendCapUsd()

  return (
    <div className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
      <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Pricing reference</p>
      <p className="mt-1 text-[11px] text-[#5a5a78]">
        Quote = rate × hours × valueMultiplier × tierMultiplier, floored. Source:{' '}
        <span className="font-mono text-[#a0a0b8]">src/lib/pricing.ts</span>
      </p>
      <p className="mt-2 font-mono text-[11px] tabular-nums text-[#a0a0b8]">
        WORK_SENIOR_RATE={formatUSD(rate)} · WORK_VALUE_MULTIPLIER={vm}
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-[#a0a0b8]" aria-label="Monthly build spend cap">
        BUILD_SPEND_CAP_USD={formatUSD(spendCap)} / client / month — quotes over remaining are blocked
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-[11px]">
          <thead>
            <tr className="text-[#D4AF37] uppercase tracking-widest">
              <th className="pb-2 pr-2 font-medium">Tier</th>
              <th className="pb-2 pr-2 font-medium">Label</th>
              <th className="pb-2 pr-2 font-medium">×</th>
              <th className="pb-2 pr-2 font-medium">Default hrs</th>
              <th className="pb-2 pr-2 font-medium">Floor</th>
              <th className="pb-2 font-medium">Review</th>
            </tr>
          </thead>
          <tbody>
            {COMPLEXITY_TIERS.map((t, i) => {
              const cfg = TIERS[t]
              return (
                <tr
                  key={t}
                  className={i % 2 === 0 ? 'bg-[#0a0a0f]' : 'bg-[#12121a]'}
                >
                  <td className="py-1.5 pr-2 font-mono text-white">{cfg.tier}</td>
                  <td className="py-1.5 pr-2 text-[#a0a0b8]">{cfg.label}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-white">
                    {cfg.multiplier}
                  </td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-white">
                    {cfg.defaultHours}
                  </td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-white">
                    {formatUSD(cfg.floor)}
                  </td>
                  <td className="py-1.5 text-[#a0a0b8]">
                    {cfg.requiresManualReview ? (
                      <span aria-label="Manual review required">⚠ Manual</span>
                    ) : (
                      <span aria-label="Auto-approvable tier">✓ Standard</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[#5a5a78]">
        Full flow: <span className="font-mono">docs/CUSTOMER_CHANGE_REQUEST_FLOW.md</span>
      </p>
    </div>
  )
}
