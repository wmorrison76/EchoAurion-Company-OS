'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { navItems } from '@/lib/nav'
import { cn } from '@/lib/utils'

interface SidebarProps {
  /** Rendered in the footer (user identity + sign out). */
  footer: React.ReactNode
}

export function Sidebar({ footer }: SidebarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/support') return pathname === '/support'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <>
      {/* Mobile top bar with hamburger (< md) */}
      <div className="flex items-center justify-between border-b border-[#2a2a3f] bg-[#0a0a0f] px-4 py-3 md:hidden">
        <span className="text-sm font-semibold tracking-tight text-white">
          Echo<span className="text-[#D4AF37]">Aurion</span>
        </span>
        <button
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-[#2a2a3f] p-2 text-[#a0a0b8] transition-colors duration-150 hover:bg-[#22223a] hover:text-white"
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <nav
        aria-label="Primary navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#2a2a3f] bg-[#0a0a0f] transition-transform duration-200 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="hidden items-center px-6 py-5 md:flex">
          <span className="text-base font-semibold tracking-tight text-white">
            Echo<span className="text-[#D4AF37]">Aurion</span>
          </span>
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4 md:py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={`${item.label} — ${item.description}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors duration-150',
                    active
                      ? 'border-[#D4AF37] bg-[#1a1a26] text-white'
                      : 'border-transparent text-[#a0a0b8] hover:bg-[#22223a] hover:text-white'
                  )}
                >
                  <Icon size={18} aria-hidden="true" className={active ? 'text-[#D4AF37]' : ''} />
                  <span className="flex flex-col">
                    <span className="font-medium leading-tight">{item.label}</span>
                    <span className="text-[11px] leading-tight text-[#5a5a78]">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-[#2a2a3f] p-3">{footer}</div>
      </nav>
    </>
  )
}
