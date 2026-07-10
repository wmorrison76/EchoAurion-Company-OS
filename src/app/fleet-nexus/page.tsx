import { AppShell } from '@/components/layout/AppShell'
import { FleetNexusViewer } from '@/components/fleet-nexus/FleetNexusViewer'

export const metadata = {
  title: 'Fleet Nexus · EchoAurion Company OS',
}

export default function FleetNexusPage() {
  return (
    <AppShell
      title="Fleet Nexus"
      subtitle="Operational map — Render services + Support client health"
    >
      <FleetNexusViewer />
    </AppShell>
  )
}
