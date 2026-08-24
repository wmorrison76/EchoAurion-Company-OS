import { AppShell } from '@/components/layout/AppShell'
import { SupportInbox } from '@/components/support/SupportInbox'

export const metadata = {
  title: 'Support Inbox · EchoAurion Company OS',
}

export default function SupportInboxPage() {
  return (
    <AppShell
      title="Support Inbox"
      subtitle="Optional triage — official path is Help Desk (this page is hidden from the sidebar)"
    >
      <SupportInbox />
    </AppShell>
  )
}
