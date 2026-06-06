import { KPICard } from '@/components/ui/KPICard'
import { formatUSD } from '@/lib/utils'
import type { PLMonth } from '@/types/financial'

export function PLSummary({ pl }: { pl: PLMonth[] }) {
  return (
    <KPICard title="Monthly P&L" className="sm:col-span-2 xl:col-span-3">
      {pl.length === 0 ? (
        <p className="text-sm text-[#a0a0b8]">No P&amp;L data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-[#D4AF37]">
                <th className="py-2 pr-4 font-medium">Month</th>
                <th className="py-2 pr-4 text-right font-medium">Revenue</th>
                <th className="py-2 pr-4 text-right font-medium">Expenses</th>
                <th className="py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {pl.map((m, i) => (
                <tr key={m.month} className={i % 2 === 0 ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'}>
                  <td className="py-2 pr-4 font-sans text-[#a0a0b8]">{m.label}</td>
                  <td className="py-2 pr-4 text-right text-white">{formatUSD(m.revenue)}</td>
                  <td className="py-2 pr-4 text-right text-white">{formatUSD(m.expenses)}</td>
                  <td
                    className={`py-2 text-right ${m.net >= 0 ? 'text-[#D4AF37]' : 'text-white'}`}
                  >
                    {m.net >= 0 ? '+' : '−'}
                    {formatUSD(Math.abs(m.net))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </KPICard>
  )
}
