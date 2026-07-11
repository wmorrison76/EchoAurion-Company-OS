'use client'

import Link from 'next/link'
import { Smartphone, FlaskConical } from 'lucide-react'

/** Quick links for William — Echo chrome lab + iPhone install. */
export function LabInstallLinks() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Labs & phone</p>
        <p className="mt-1 text-sm text-[#a0a0b8]">
          Prove Help Desk chrome + paid-via-profile before product wiring. Install Dr. OS on iPhone 15.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/lab/echo-chrome"
          aria-label="Open Echo chrome lab"
          className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2.5 text-xs text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a]"
        >
          <FlaskConical size={14} aria-hidden="true" />
          Open Echo chrome lab
        </Link>
        <Link
          href="/install"
          aria-label="Install Dr. OS on iPhone"
          className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a3f] px-3 py-2.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
        >
          <Smartphone size={14} aria-hidden="true" />
          Install on iPhone
        </Link>
      </div>
    </div>
  )
}
