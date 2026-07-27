import { AppShell } from '@/components/layout/AppShell'
import { KanbanBoard } from '@/components/crm/KanbanBoard'

export const metadata = {
  title: 'CRM · EchoAurion Company OS',
}

export default function CrmPage({ searchParams }: { searchParams: { tag?: string } }) {
  return (
    <AppShell title="CRM" subtitle="Partnership & investor pipeline">
      <KanbanBoard tagFilter={searchParams.tag} />
    </AppShell>
  )
}
