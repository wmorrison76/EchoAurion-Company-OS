import { AppShell } from '@/components/layout/AppShell'
import { ContactDetail } from '@/components/crm/ContactDetail'

export const metadata = {
  title: 'Contact · EchoAurion Company OS',
}

export default function ContactPage({ params }: { params: { id: string } }) {
  return (
    <AppShell title="Contact" subtitle="CRM record">
      <ContactDetail id={params.id} />
    </AppShell>
  )
}
