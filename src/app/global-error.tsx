'use client'

/**
 * Root layout error boundary — must define its own html/body.
 * Reports via self-report when session cookies are still available.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Best-effort report (may 401 if session gone).
  if (typeof window !== 'undefined') {
    const message = (error.message || 'Company OS global error').slice(0, 500)
    void fetch('/api/help-desk/self-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: `cos-global-${(error.digest ?? message).slice(0, 40).replace(/\W/g, '')}`,
        message,
        stack: error.stack?.slice(0, 4000) ?? null,
        errorClass: error.name || 'Error',
        moduleHint: 'global',
        source: 'global-error.tsx',
      }),
    }).catch(() => {})
  }

  return (
    <html lang="en">
      <body style={{ background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui', padding: 24 }}>
        <p style={{ color: '#D4AF37', fontSize: 12, letterSpacing: '0.1em' }}>DR. OS</p>
        <h1 style={{ fontSize: 18, marginTop: 12 }}>We’re on it</h1>
        <p style={{ color: '#a0a0b8', fontSize: 14, maxWidth: 420 }}>
          Company OS hit a critical UI error. Recovery is available below.
        </p>
        <button
          type="button"
          onClick={reset}
          aria-label="Try again"
          style={{
            marginTop: 16,
            padding: '8px 16px',
            border: '1px solid #D4AF37',
            background: '#1a1a26',
            color: '#D4AF37',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
