'use client'

import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { ConfigDebtHealth } from '@/types/dr-os'

/**
 * Env/config gaps on Dr. OS — not the exception flywheel.
 * Knights do not set Render secrets; William pastes these.
 */
export function ConfigDebtPanel({ data }: { data?: ConfigDebtHealth }) {
  if (!data) return <SkeletonCard />

  const count = data.items.length
  const level = count === 0 ? 'ok' : 'warn'
  const label = count === 0 ? 'Clear' : `${count} to paste`

  return (
    <KPICard
      title="Config debt"
      badge={<StatusBadge level={level} label={label} count={count || undefined} />}
      className="sm:col-span-2 xl:col-span-3"
    >
      <p className="mb-2 text-xs text-[#a0a0b8]">
        These reds are missing Render env vars — not crashes. Knights cannot invent keys;
        paste on <span className="text-white">echoaurion-company-os</span> → Environment,
        then redeploy.
      </p>
      {count === 0 ? (
        <p className="text-sm text-white">✓ No config debt — panel env vars present.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#2a2a3f]" aria-label="Config debt list">
          {data.items.map((item) => (
            <li key={item.panel} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">{item.panel}</span>
                <StatusBadge level="warn" label="Paste env" />
              </div>
              <p className="text-xs text-[#a0a0b8]">{item.reason}</p>
              <p className="font-mono text-[11px] text-[#D4AF37]">
                {item.envVars.join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {data.ticketId ? (
        <p className="mt-3 text-[11px] text-[#5a5a78]">
          Daily SYSTEM reminder (no Knights):{' '}
          <a
            href={`/help-desk?ticket=${data.ticketId}`}
            className="text-[#D4AF37] underline"
            aria-label="Open config debt Help Desk ticket"
          >
            ticket {data.ticketId.slice(0, 8)}…
          </a>
        </p>
      ) : null}
    </KPICard>
  )
}
