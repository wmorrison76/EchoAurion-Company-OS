import { AppShell } from '@/components/layout/AppShell'
import { KnowledgePlaneConsole } from '@/components/knowledge-plane/KnowledgePlaneConsole'

export const metadata = {
  title: 'Knowledge Plane · EchoAurion Company OS',
}

export default function KnowledgePlanePage() {
  return (
    <AppShell
      title="Aurion Knowledge Plane"
      subtitle="Echo Resonance Network · anonymized learning · no guest PII"
    >
      <KnowledgePlaneConsole />
    </AppShell>
  )
}
