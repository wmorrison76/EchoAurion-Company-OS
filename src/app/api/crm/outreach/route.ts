import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { OUTREACH_CHANNELS, OUTREACH_STATUSES } from '@/types/crm'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

// Gmail readonly OAuth is out of scope. Manual outreach only — no sync button.

const schema = z.object({
  contactId: z.string().min(1),
  channel: z.enum(OUTREACH_CHANNELS),
  subject: z.string().optional(),
  body: z.string().optional(),
  sentAt: z.string().datetime().optional(),
  status: z.enum(OUTREACH_STATUSES).default('SENT'),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid outreach payload' }, { status: 400 })
    }
    const outreach = await db.outreach.create({
      data: {
        contactId: parsed.data.contactId,
        channel: parsed.data.channel,
        subject: parsed.data.subject ?? null,
        body: parsed.data.body ?? null,
        sentAt: parsed.data.sentAt ? new Date(parsed.data.sentAt) : new Date(),
        status: parsed.data.status,
        actor: 'william_morrison',
      },
    })
    await audit('william_morrison', 'crm.outreach.create', outreach.id, {
      contactId: parsed.data.contactId,
    })
    return Response.json(
      { success: true, data: { id: outreach.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Outreach create failed' },
      { status: 500 }
    )
  }
}
