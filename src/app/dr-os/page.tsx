import { AppShell } from '@/components/layout/AppShell'
import { DrOsDashboard } from '@/components/dr-os/DrOsDashboard'

export const metadata = {
  title: 'Dr. OS · EchoAurion Company OS',
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

export default function DrOsPage() {
  return (
    <AppShell title="Dr. OS" subtitle={`System overview — ${dateFmt.format(new Date())}`}>
      <DrOsDashboard />
    </AppShell>
  )
}
