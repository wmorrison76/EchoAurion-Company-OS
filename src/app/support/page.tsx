import { AppShell } from '@/components/layout/AppShell'
import { SupportConsole } from '@/components/support/SupportConsole'

export const metadata = {
  title: 'Support · EchoAurion Company OS',
}

export default function SupportPage() {
  return (
    <AppShell title="Support" subtitle="Client health & support sessions — Tier 0 (view-only)">
      <SupportConsole />
    </AppShell>
  )
}
