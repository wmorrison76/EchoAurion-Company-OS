'use client'

import { useEffect } from 'react'

function fingerprintFrom(message: string, digest?: string): string {
  const raw = `${digest ?? ''}|${message}`.slice(0, 200)
  let h = 0
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0
  return `cos-${h.toString(16).padStart(8, '0')}-${raw.replace(/\W+/g, '').slice(0, 24) || 'err'}`
}

/**
 * Soft App Router error UI — reports to Help Desk (productLine company-os)
 * so we dogfood the same capture flywheel on Company OS itself.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const message = (error.message || 'Company OS UI error').slice(0, 500)
    const stack = error.stack?.slice(0, 4000) ?? null
    void fetch('/api/help-desk/self-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: fingerprintFrom(message, error.digest),
        message,
        stack,
        errorClass: error.name || 'Error',
        moduleHint: 'app-router',
        source: 'error.tsx',
      }),
    }).catch(() => {
      /* never block recovery UI */
    })
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-4 text-center">
      <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Dr. OS</p>
      <h1 className="text-lg font-semibold text-white">We’re on it</h1>
      <p className="max-w-md text-sm text-[#a0a0b8]">
        Something went wrong in Company OS. A Help Desk ticket was opened automatically
        (product line company-os). No stack traces shown here.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-4 py-2 text-sm text-[#D4AF37] transition-colors hover:bg-[#22223a]"
        aria-label="Try again"
      >
        Try again
      </button>
    </div>
  )
}
