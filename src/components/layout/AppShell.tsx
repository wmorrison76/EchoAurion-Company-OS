import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { SignOutButton } from '@/components/auth/SignOutButton'

interface AppShellProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * Authenticated application shell: fixed sidebar + top bar + main content.
 * Performs a defense-in-depth auth check on top of `middleware.ts` (§8.4).
 */
export async function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const name = session.user.name ?? 'William Morrison'

  const footer = (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <p className="text-sm font-medium text-white">{name}</p>
        <p className="text-[11px] uppercase tracking-widest text-[#D4AF37]">Dr. OS</p>
      </div>
      <SignOutButton />
    </div>
  )

  return (
    <div className="min-h-screen bg-bg-base">
      <Sidebar footer={footer} />
      <div className="md:pl-60">
        <TopBar title={title} subtitle={subtitle} actions={actions} />
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
