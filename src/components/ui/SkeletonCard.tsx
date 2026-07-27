// Loading skeleton matching the KPICard footprint (CLAUDE.md §4.4 — animate-pulse).
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-4 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-6"
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 animate-pulse rounded bg-[#1a1a26]" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-[#1a1a26]" />
      </div>
      <div className="h-8 w-32 animate-pulse rounded bg-[#1a1a26]" />
      <div className="h-3 w-40 animate-pulse rounded bg-[#1a1a26]" />
    </div>
  )
}
