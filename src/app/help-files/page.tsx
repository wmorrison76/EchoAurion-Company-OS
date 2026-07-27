import { AppShell } from '@/components/layout/AppShell'
import { HelpFilesConsole } from '@/components/help-files/HelpFilesConsole'

export const metadata = {
  title: 'Help Files · EchoAurion Company OS',
}

export default function HelpFilesPage() {
  return (
    <AppShell
      title="Help Files"
      subtitle="Knowledge base · macros Knights cite · send to client"
    >
      <HelpFilesConsole />
    </AppShell>
  )
}
