import { AppShell } from '@/components/layout/AppShell'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatUSD } from '@/lib/utils'
import {
  COST_TABLE,
  COST_TOTAL,
  MIGRATION_CHECKLIST,
  STACK_RESOURCES,
} from '@/lib/aurion-index'

export const metadata = {
  title: 'AurionIndex · EchoAurion Company OS',
}

export default function AurionIndexPage() {
  const completed = MIGRATION_CHECKLIST.filter((i) => i.done).length

  return (
    <AppShell title="AurionIndex" subtitle="AWS infrastructure — CDK stack & migration">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard
          title="Stack Resources"
          className="sm:col-span-2"
          badge={<StatusBadge level="unknown" label="Not deployed" />}
        >
          <ul className="flex flex-col divide-y divide-[#2a2a3f]">
            {STACK_RESOURCES.map((r) => (
              <li key={r.name} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-white">{r.name}</span>
                <span className="text-xs text-[#a0a0b8]">{r.detail}</span>
              </li>
            ))}
          </ul>
        </KPICard>

        <KPICard title="Est. Monthly Cost">
          <p className="font-mono text-3xl font-semibold tabular-nums text-white">
            {formatUSD(COST_TOTAL)}
          </p>
          <p className="mt-1 text-xs text-[#a0a0b8]">
            NAT Gateway dominates early cost (~$32/mo).
          </p>
        </KPICard>

        <KPICard
          title="Migration Checklist"
          className="sm:col-span-2 xl:col-span-3"
          badge={
            <StatusBadge
              level={completed === MIGRATION_CHECKLIST.length ? 'ok' : 'unknown'}
              label={`${completed}/${MIGRATION_CHECKLIST.length} complete`}
            />
          }
        >
          <ul className="flex flex-col gap-2">
            {MIGRATION_CHECKLIST.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-white">
                  <span aria-hidden="true" className="font-mono text-[#5a5a78]">
                    {item.done ? '☑' : '☐'}
                  </span>
                  {item.label}
                </span>
                <StatusBadge
                  level={item.done ? 'ok' : 'unknown'}
                  label={item.done ? 'Done' : 'Pending'}
                />
              </li>
            ))}
          </ul>
        </KPICard>

        <KPICard title="Cost Breakdown" className="sm:col-span-2 xl:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-[#D4AF37]">
                  <th className="py-2 pr-4 font-medium">Service</th>
                  <th className="py-2 pr-4 font-medium">Tier</th>
                  <th className="py-2 text-right font-medium">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {COST_TABLE.map((row, i) => (
                  <tr key={row.service} className={i % 2 === 0 ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'}>
                    <td className="py-2 pr-4 text-white">{row.service}</td>
                    <td className="py-2 pr-4 text-[#a0a0b8]">{row.tier}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-white">
                      {formatUSD(row.monthly)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[#2a2a3f]">
                  <td className="py-2 pr-4 font-medium text-white" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2 text-right font-mono font-semibold tabular-nums text-[#D4AF37]">
                    {formatUSD(COST_TOTAL)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </KPICard>
      </div>
    </AppShell>
  )
}
