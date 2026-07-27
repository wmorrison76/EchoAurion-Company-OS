import { AppShell } from '@/components/layout/AppShell'
import { PilotLinksPanel } from '@/components/support/PilotLinksPanel'

export const dynamic = 'force-dynamic'

export default function PilotLinksPage() {
  return (
    <AppShell title="Pilot links" subtitle="Connection status · heartbeat · standby">
      <PilotLinksPanel />
    </AppShell>
  )
}
