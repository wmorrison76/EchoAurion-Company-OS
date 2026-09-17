import { AppShell } from '@/components/layout/AppShell'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Marketing Analytics · EchoAurion Company OS',
}

type VisitPayload = {
  sessionId?: string
  source?: string
  medium?: string
  campaign?: string
  content?: string
  landingPath?: string
  referrerHost?: string
}

type Visit = VisitPayload & { createdAt: Date }

function payloadOf(value: unknown): VisitPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const read = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : undefined)
  return {
    sessionId: read('sessionId'),
    source: read('source'),
    medium: read('medium'),
    campaign: read('campaign'),
    content: read('content'),
    landingPath: read('landingPath'),
    referrerHost: read('referrerHost'),
  }
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '0%' : 'New'
  const pct = ((current - previous) / previous) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
}

function sourceLabel(source?: string): string {
  if (!source) return 'unknown'
  if (source === 'linkedin') return 'LinkedIn'
  if (source === 'instagram') return 'Instagram'
  if (source === 'direct') return 'Direct'
  return source
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function hourKey(date: Date): string {
  const shifted = new Date(date.getTime() - 4 * 60 * 60 * 1000)
  return `${shifted.toISOString().slice(5, 10)} ${shifted.toISOString().slice(11, 13)}:00`
}

export default async function MarketingAnalyticsPage() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  const rows = await db.auditLog.findMany({
    where: {
      actor: 'public_marketing',
      action: 'marketing.visit',
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { createdAt: true, payload: true },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  })

  const visits: Visit[] = rows.map((row) => ({ ...payloadOf(row.payload), createdAt: row.createdAt }))
  const currentWeek = visits.filter((visit) => visit.createdAt >= sevenDaysAgo)
  const previousWeek = visits.filter(
    (visit) => visit.createdAt >= fourteenDaysAgo && visit.createdAt < sevenDaysAgo
  )
  const uniqueSessions = new Set(currentWeek.map((visit) => visit.sessionId).filter(Boolean)).size
  const socialVisits = currentWeek.filter((visit) => ['linkedin', 'instagram'].includes(visit.source ?? '')).length

  const sources = new Map<string, { visits: number; sessions: Set<string> }>()
  for (const visit of currentWeek) {
    const key = sourceLabel(visit.source)
    const entry = sources.get(key) ?? { visits: 0, sessions: new Set<string>() }
    entry.visits += 1
    if (visit.sessionId) entry.sessions.add(visit.sessionId)
    sources.set(key, entry)
  }

  const campaigns = new Map<string, { source: string; content: string; visits: number; sessions: Set<string> }>()
  for (const visit of visits) {
    if (!visit.campaign) continue
    const key = `${visit.source ?? 'unknown'}|${visit.campaign}|${visit.content ?? ''}`
    const entry = campaigns.get(key) ?? {
      source: sourceLabel(visit.source),
      content: visit.content ?? '—',
      visits: 0,
      sessions: new Set<string>(),
    }
    entry.visits += 1
    if (visit.sessionId) entry.sessions.add(visit.sessionId)
    campaigns.set(key, entry)
  }

  const daily = new Map<string, number>()
  for (const visit of visits) daily.set(dayKey(visit.createdAt), (daily.get(dayKey(visit.createdAt)) ?? 0) + 1)
  const dailyRows = Array.from(daily.entries()).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14)
  const maxDaily = Math.max(1, ...dailyRows.map(([, count]) => count))

  const hourly = new Map<string, number>()
  for (const visit of visits.filter((item) => item.createdAt >= fortyEightHoursAgo)) {
    const key = hourKey(visit.createdAt)
    hourly.set(key, (hourly.get(key) ?? 0) + 1)
  }
  const hourlyRows = Array.from(hourly.entries()).sort(([a], [b]) => b.localeCompare(a)).slice(0, 24)
  const maxHourly = Math.max(1, ...hourlyRows.map(([, count]) => count))

  const campaignRows = Array.from(campaigns.entries())
    .map(([key, value]) => ({ campaign: key.split('|')[1], ...value, sessions: value.sessions.size }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20)

  return (
    <AppShell
      title="Marketing Analytics"
      subtitle="Anonymous website attribution · LinkedIn / Instagram / campaign traffic"
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Visits · last 7 days" value={String(currentWeek.length)} note={`${pctChange(currentWeek.length, previousWeek.length)} vs prior 7 days`} />
          <Metric label="Unique sessions · 7 days" value={String(uniqueSessions)} note="Anonymous browser-tab sessions" />
          <Metric label="Social-attributed visits" value={String(socialVisits)} note="LinkedIn + Instagram UTMs" />
          <Metric label="Tracked visits · 30 days" value={String(visits.length)} note="Crawler traffic excluded" />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Traffic by source · last 7 days" subtitle="Use this to compare LinkedIn, Instagram, referrals and direct traffic.">
            <div className="space-y-3">
              {Array.from(sources.entries())
                .sort((a, b) => b[1].visits - a[1].visits)
                .map(([source, stats]) => (
                  <div key={source} className="flex items-center justify-between rounded-lg border border-[#2a2a3f] bg-[#101018] px-4 py-3">
                    <span className="font-medium text-white">{source}</span>
                    <span className="text-sm text-[#a0a0b8]">{stats.visits} visits · {stats.sessions.size} sessions</span>
                  </div>
                ))}
              {sources.size === 0 ? <Empty /> : null}
            </div>
          </Panel>

          <Panel title="Last 48 hours · hourly" subtitle="This is the view to check immediately after a post publishes. Times shown in ET.">
            <div className="space-y-2">
              {hourlyRows.map(([hour, count]) => (
                <BarRow key={hour} label={hour} count={count} max={maxHourly} />
              ))}
              {hourlyRows.length === 0 ? <Empty /> : null}
            </div>
          </Panel>
        </section>

        <Panel title="Campaign attribution" subtitle="Every social link should carry source, campaign and content UTMs so each post can be measured independently.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-[#6f6f8f]">
                <tr className="border-b border-[#2a2a3f]">
                  <th className="px-3 py-3">Campaign</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Post / content</th>
                  <th className="px-3 py-3 text-right">Visits</th>
                  <th className="px-3 py-3 text-right">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((row) => (
                  <tr key={`${row.source}-${row.campaign}-${row.content}`} className="border-b border-[#1d1d2b] text-[#d7d7e3]">
                    <td className="px-3 py-3 font-medium text-white">{row.campaign}</td>
                    <td className="px-3 py-3">{row.source}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.content}</td>
                    <td className="px-3 py-3 text-right">{row.visits}</td>
                    <td className="px-3 py-3 text-right">{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {campaignRows.length === 0 ? <Empty /> : null}
          </div>
        </Panel>

        <Panel title="Daily traffic · last 14 active days" subtitle="Useful for seeing whether campaign days create a sustained lift over baseline traffic.">
          <div className="space-y-2">
            {dailyRows.map(([day, count]) => <BarRow key={day} label={day} count={count} max={maxDaily} />)}
            {dailyRows.length === 0 ? <Empty /> : null}
          </div>
        </Panel>

        <div className="rounded-xl border border-[#3b3322] bg-[#17140d] px-4 py-4 text-sm text-[#d7c78f]">
          Social-link standard: <span className="font-mono text-xs">?utm_source=linkedin|instagram&amp;utm_medium=organic_social|paid_social&amp;utm_campaign=&lt;campaign&gt;&amp;utm_content=&lt;post_id&gt;</span>. The dashboard intentionally stores no IP address, email, full referrer URL, or arbitrary query string.
        </div>
      </div>
    </AppShell>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-[#2a2a3f] bg-[#111119] p-5">
      <p className="text-[11px] uppercase tracking-widest text-[#6f6f8f]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-[#8e8ea6]">{note}</p>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#2a2a3f] bg-[#0f0f17] p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mb-4 mt-1 text-xs text-[#777793]">{subtitle}</p>
      {children}
    </section>
  )
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const width = Math.max(3, Math.round((count / max) * 100))
  return (
    <div className="grid grid-cols-[100px_1fr_42px] items-center gap-3 text-xs sm:grid-cols-[120px_1fr_42px]">
      <span className="font-mono text-[#8e8ea6]">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-[#1d1d2b]">
        <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${width}%` }} />
      </div>
      <span className="text-right font-medium text-white">{count}</span>
    </div>
  )
}

function Empty() {
  return <p className="py-6 text-center text-sm text-[#6f6f8f]">No attributed traffic yet. Data begins after this release is deployed.</p>
}
