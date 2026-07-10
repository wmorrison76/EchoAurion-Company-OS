import { AppShell } from '@/components/layout/AppShell'
import { SupportInbox } from '@/components/support/SupportInbox'

export const metadata = {
  title: 'Support Inbox · EchoAurion Company OS',
}

export default function SupportInboxPage() {
  return (
    <AppShell
      title="Support Inbox"
      subtitle="Unified triage — open in Help Desk for live tickets · Support for health panels"
    >
      <SupportInbox />
    </AppShell>
  )
}
