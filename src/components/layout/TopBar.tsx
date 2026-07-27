interface TopBarProps {
  title: string
  subtitle?: string
  /** Optional right-aligned actions (filters, refresh, etc.). */
  actions?: React.ReactNode
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#2a2a3f] bg-[#0a0a0f]/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-white">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-[#a0a0b8]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
