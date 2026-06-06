import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { navItems } from '@/lib/nav'

export const metadata = {
  title: 'Dr. OS · EchoAurion Company OS',
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export default function DrOsPage() {
  const today = dateFmt.format(new Date())
  const modules = navItems.filter((item) => item.href !== '/dr-os')

  return (
    <AppShell title="Dr. OS" subtitle="System overview — Aurion Holdings, Inc.">
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">{today}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Welcome back, William
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[#a0a0b8]">
          This is the EchoAurion Company OS. Live system, financial, CRM, and revenue panels come
          online as each module is built. Use the navigation to move between modules.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xs uppercase tracking-widest text-[#D4AF37]">Modules</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={`Open ${item.label} — ${item.description}`}
                className="group flex items-start justify-between gap-4 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-6 transition-colors duration-150 hover:bg-[#22223a]"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg border border-[#2a2a3f] bg-[#1a1a26] p-2 text-[#D4AF37]">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold text-white">{item.label}</p>
                    <p className="text-xs text-[#a0a0b8]">{item.description}</p>
                  </div>
                </div>
                <ArrowUpRight
                  size={16}
                  aria-hidden="true"
                  className="text-[#5a5a78] transition-colors duration-150 group-hover:text-[#D4AF37]"
                />
              </Link>
            )
          })}
        </div>
      </section>
    </AppShell>
  )
}
