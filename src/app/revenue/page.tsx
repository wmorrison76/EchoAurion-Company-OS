import { AppShell } from '@/components/layout/AppShell'
import { RevenueDashboard } from '@/components/revenue/RevenueDashboard'

export const metadata = {
  title: 'Revenue · EchoAurion Company OS',
}

export default function RevenuePage() {
  return (
    <AppShell title="Revenue" subtitle="Stripe MRR · runway · raise tracker">
      <RevenueDashboard />
    </AppShell>
  )
}
