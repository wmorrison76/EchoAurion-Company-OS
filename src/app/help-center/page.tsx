import { HelpCenterLite } from '@/components/help-center/HelpCenterLite'

export const metadata = {
  title: 'Help Center · EchoAurion',
  description: 'Property-facing help articles for EchoAurion hospitality ops.',
}

/** Public property-facing Help Center lite — no login. */
export default function HelpCenterPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-[#D4AF37]">EchoAurion</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Help Center</h1>
        <p className="mt-2 text-sm text-[#a0a0b8]">
          Short how-tos for property staff. No guest data. For live tech issues, use in-app Help
          Desk.
        </p>
        <div className="mt-6">
          <HelpCenterLite />
        </div>
      </div>
    </main>
  )
}
