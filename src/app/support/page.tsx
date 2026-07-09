import { AppShell } from '@/components/layout/AppShell'
import { SupportConsole } from '@/components/support/SupportConsole'

export const metadata = {
  title: 'Support · EchoAurion Company OS',
}

export default function SupportPage() {
  return (
    <AppShell
      title="Support"
      subtitle="Client health · Ask the Knights · Free vs Charge policy · approve before any fix ships"
    >
      <SupportConsole />
    </AppShell>
  )
}
