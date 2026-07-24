import { headers } from 'next/headers'

/**
 * Public /status page powering status.echoaurion.com.
 * Server-rendered to avoid needing client-side auth, refreshes every 30s.
 * When a proper CNAME is added, point status.echoaurion.com CNAME →
 * echoaurion-company-os.onrender.com and let this page render at that host.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 30

type Level = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown'

interface Component {
  id: string
  name: string
  status: Level
  detail?: string
}

interface Status {
  generatedAt: string
  overall: Level
  components: Component[]
}

const LEVEL_LABEL: Record<Level, string> = {
  operational: 'Operational',
  degraded: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  unknown: 'Unknown',
}

const LEVEL_COLOR: Record<Level, string> = {
  operational: '#10b981',
  degraded: '#f59e0b',
  partial_outage: '#f97316',
  major_outage: '#ef4444',
  unknown: '#6b7280',
}

async function loadStatus(): Promise<Status | null> {
  try {
    const h = await headers()
    const host = h.get('host') ?? 'localhost:3000'
    const protocol = host.startsWith('localhost') ? 'http' : 'https'
    const res = await fetch(`${protocol}://${host}/api/status`, { cache: 'no-store' })
    const body = await res.json()
    return body.success ? (body.data as Status) : null
  } catch {
    return null
  }
}

export default async function StatusPage(): Promise<JSX.Element> {
  const status = await loadStatus()

  const color = status ? LEVEL_COLOR[status.overall] : '#6b7280'
  const label = status ? LEVEL_LABEL[status.overall] : 'Unable to reach status service'

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: color }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>EchoAurion — {label}</h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9ca3af' }}>
                {status ? `Last checked ${new Date(status.generatedAt).toUTCString()}` : 'Waiting for first check…'}
              </p>
            </div>
          </div>

          {status ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid #2a2a3f', borderRadius: 8, overflow: 'hidden' }}>
              {status.components.map((c, i) => (
                <li
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: i % 2 === 0 ? '#12121a' : '#0f0f18',
                    borderTop: i > 0 ? '1px solid #2a2a3f' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    {c.detail ? <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.detail}</div> : null}
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      color: LEVEL_COLOR[c.status],
                    }}
                  >
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: LEVEL_COLOR[c.status] }} />
                    {LEVEL_LABEL[c.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: 40, border: '1px solid #2a2a3f', borderRadius: 8, textAlign: 'center', color: '#9ca3af' }}>
              Status service unavailable. Check <a href="/api/status" style={{ color: '#3b82f6' }}>/api/status</a> directly.
            </div>
          )}

          <p style={{ marginTop: 32, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            EchoAurion Platform Status · Refreshes every 30 seconds ·{' '}
            <a href="mailto:support@echoaurion.com" style={{ color: '#6b7280' }}>
              support@echoaurion.com
            </a>
          </p>
        </main>
      </body>
    </html>
  )
}
