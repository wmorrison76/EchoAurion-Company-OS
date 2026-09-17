import { z } from 'zod'
import { db } from '@/lib/db'
import { allowRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const visitSchema = z.object({
  sessionId: z.string().uuid(),
  source: z.string().min(1).max(180),
  medium: z.string().min(1).max(180),
  campaign: z.string().max(180).optional(),
  content: z.string().max(180).optional(),
  term: z.string().max(180).optional(),
  landingPath: z.string().startsWith('/').max(300),
  referrerHost: z.string().max(180).optional(),
})

const BOT_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|linkedinbot|whatsapp|telegrambot|discordbot/i

/**
 * Public, PII-free marketing attribution ingest.
 *
 * The source IP is used only as an in-memory abuse-control key and is never
 * persisted. User-agent is checked only to suppress obvious crawler traffic.
 */
export async function POST(req: Request): Promise<Response> {
  const userAgent = req.headers.get('user-agent') ?? ''
  if (BOT_RE.test(userAgent)) return new Response(null, { status: 204 })

  const ip = clientIp(req)
  const perIp = allowRateLimit(`marketing:visit:ip:${ip}`, 60, 60_000)
  const global = allowRateLimit('marketing:visit:global', 1200, 60_000)
  if (!perIp.ok || !global.ok) {
    return Response.json({ error: 'Rate limited' }, { status: 429 })
  }

  let parsed: z.infer<typeof visitSchema>
  try {
    parsed = visitSchema.parse(await req.json())
  } catch {
    return Response.json({ error: 'Invalid attribution payload' }, { status: 400 })
  }

  const payload = {
    sessionId: parsed.sessionId,
    source: parsed.source,
    medium: parsed.medium,
    ...(parsed.campaign ? { campaign: parsed.campaign } : {}),
    ...(parsed.content ? { content: parsed.content } : {}),
    ...(parsed.term ? { term: parsed.term } : {}),
    landingPath: parsed.landingPath,
    ...(parsed.referrerHost ? { referrerHost: parsed.referrerHost } : {}),
  }

  await db.auditLog.create({
    data: {
      actor: 'public_marketing',
      action: 'marketing.visit',
      payload,
    },
  })

  return new Response(null, { status: 204 })
}
