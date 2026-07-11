import { AppShell } from '@/components/layout/AppShell'
import { EchoChromeLab } from '@/components/lab/EchoChromeLab'
import Link from 'next/link'

export const metadata = {
  title: 'Echo chrome lab · EchoAurion Company OS',
}

export default function EchoChromeLabPage() {
  return (
    <AppShell
      title="Echo chrome lab"
      subtitle="Test harness — Help Desk left of avatar · paid-via-profile · not product UI"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/help-desk"
            className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
            aria-label="Open Help Desk"
          >
            Help Desk
          </Link>
          <Link
            href="/install"
            className="rounded-lg border border-[#2a2a3f] px-3 py-1.5 text-xs text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]"
            aria-label="Install Dr. OS on iPhone"
          >
            Install iPhone
          </Link>
        </div>
      }
    >
      <EchoChromeLab />
    </AppShell>
  )
}
