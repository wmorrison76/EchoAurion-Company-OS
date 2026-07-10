import { AppShell } from '@/components/layout/AppShell'

export const metadata = {
  title: 'Help Desk · Loading',
}

export default function HelpDeskLoading() {
  return (
    <AppShell title="Help Desk" subtitle="Loading…">
      <div className="h-64 animate-pulse rounded-xl bg-[#12121a]" />
    </AppShell>
  )
}
