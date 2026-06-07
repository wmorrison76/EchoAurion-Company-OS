import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'
import type { ContactDetail, DealStage, OutreachStatus } from '@/types/crm'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const c = await db.contact.findUnique({
      where: { id: params.id },
      include: {
        outreach: { orderBy: { sentAt: 'desc' } },
        deals: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!c) return Response.json({ success: false, error: 'Contact not found' }, { status: 404 })

    const data: ContactDetail = {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      title: c.title,
      linkedIn: c.linkedIn,
      tags: c.tags,
      notes: c.notes,
      outreach: c.outreach.map((o) => ({
        id: o.id,
        channel: o.channel,
        subject: o.subject,
        body: o.body,
        sentAt: o.sentAt.toISOString(),
        status: o.status as OutreachStatus,
        responseAt: o.responseAt?.toISOString() ?? null,
        actor: o.actor,
      })),
      deals: c.deals.map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        stage: d.stage as DealStage,
        notes: d.notes,
        expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
      })),
    }
    return Response.json({ success: true, data } satisfies APIResponse<ContactDetail>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Contact query failed' },
      { status: 500 }
    )
  }
}

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedIn: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }
    const contact = await db.contact.update({ where: { id: params.id }, data: parsed.data })
    await audit('william_morrison', 'crm.contact.update', contact.id)
    return Response.json({ success: true, data: { id: contact.id } } satisfies APIResponse<{ id: string }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Contact update failed' },
      { status: 500 }
    )
  }
}
