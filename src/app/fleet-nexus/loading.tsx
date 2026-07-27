export default function FleetNexusLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col gap-4">
      <div className="h-10 w-full animate-pulse rounded-xl bg-[#12121a]" />
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-h-[420px] animate-pulse rounded-xl bg-[#12121a]" />
        <div className="h-64 animate-pulse rounded-xl bg-[#12121a] lg:h-auto" />
      </div>
    </div>
  )
}
