import { SkeletonCard } from '@/components/ui/SkeletonCard'

export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base md:pl-60">
      <div className="border-b border-[#2a2a3f] px-4 py-4 sm:px-6">
        <div className="h-6 w-24 animate-pulse rounded bg-[#1a1a26]" />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
