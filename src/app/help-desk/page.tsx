import { Suspense } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { HelpDeskConsole } from '@/components/help-desk/HelpDeskConsole'

export const metadata = {
  title: 'Help Desk · EchoAurion Company OS',
}

export default function HelpDeskPage() {
  return (
    <AppShell
      title="Help Desk"
      subtitle="Tickets · start here · voice = dictation (phone IVR not live)"
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-[#12121a]" />}>
        <HelpDeskConsole />
      </Suspense>
    </AppShell>
  )
}
