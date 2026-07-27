import type { Metadata } from 'next'
import { Fraunces, JetBrains_Mono } from 'next/font/google'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AurionHomePage } from '@/components/marketing/AurionHomePage'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Aurion Holdings — The Source of Truth for Hospitality',
  description:
    'Aurion Holdings builds the source of truth hospitality runs on — the layer every property, vendor, and system connects to.',
  robots: { index: true, follow: true },
}

/**
 * Public marketing homepage. Authenticated operators go straight to Dr. OS.
 */
export default async function HomePage() {
  const session = await auth()
  if (session?.user) redirect('/dr-os')

  return (
    <div className={`${fraunces.variable} ${jetbrains.variable}`}>
      <style>{`
        .ah-root { --font-display: var(--font-fraunces), Georgia, serif; --font-mono: var(--font-jetbrains), ui-monospace, monospace; }
      `}</style>
      <AurionHomePage />
    </div>
  )
}
