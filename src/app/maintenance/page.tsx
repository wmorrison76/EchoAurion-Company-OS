import { AppShell } from '@/components/layout/AppShell'
import { MaintenanceConsole } from '@/components/maintenance/MaintenanceConsole'

export const dynamic = 'force-dynamic'

export default function MaintenancePage() {
  return (
    <AppShell
      title="Maintenance"
      subtitle="Schedule major-update notices · pilot blast via SSE"
    >
      <MaintenanceConsole />
    </AppShell>
  )
}
