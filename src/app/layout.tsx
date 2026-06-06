import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EchoAurion Company OS',
  description: 'Internal operating system for Aurion Holdings, Inc. (dba EchoAurion).',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-bg-base font-sans text-[#ffffff] antialiased">
        {children}
      </body>
    </html>
  )
}
