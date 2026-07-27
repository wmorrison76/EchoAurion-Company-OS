import { AppShell } from '@/components/layout/AppShell'
import { FinancialDashboard } from '@/components/financial/FinancialDashboard'

export const metadata = {
  title: 'Financial · EchoAurion Company OS',
}

export default function FinancialPage() {
  return (
    <AppShell title="Financial" subtitle="Plaid + Mercury — balances, burn, runway">
      <FinancialDashboard />
    </AppShell>
  )
}
