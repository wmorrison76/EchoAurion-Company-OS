import { AppShell } from '@/components/layout/AppShell'
import { SupportConsole } from '@/components/support/SupportConsole'

export const metadata = {
  title: 'Support · EchoAurion Company OS',
}

export default function SupportPage() {
  return (
    <AppShell
      title="Support"
      subtitle="Client health · diagnostics · Free vs Charge · approve gate (tickets live in Help Desk)"
    >
      <SupportConsole />
    </AppShell>
  )
}
