import { AppShell } from '@/components/layout/AppShell'
import { SupportInbox } from '@/components/support/SupportInbox'

export const metadata = {
  title: 'Support Inbox · EchoAurion Company OS',
}

export default function SupportInboxPage() {
  return (
    <AppShell
      title="Support Inbox"
      subtitle="Unified queue — questions · change requests · Approve free / Quote"
    >
      <SupportInbox />
    </AppShell>
  )
}
