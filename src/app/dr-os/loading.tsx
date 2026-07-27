export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base md:pl-60">
      <div className="border-b border-[#2a2a3f] px-4 py-4 sm:px-6">
        <div className="h-6 w-32 animate-pulse rounded bg-[#1a1a26]" />
      </div>
      <div className="px-4 py-6 sm:px-6">
        <div className="mb-8 space-y-2">
          <div className="h-3 w-48 animate-pulse rounded bg-[#1a1a26]" />
          <div className="h-7 w-64 animate-pulse rounded bg-[#1a1a26]" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-[#2a2a3f] bg-[#12121a]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
