import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { DEAL_STAGES } from '@/types/crm'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface ContactListItem {
  id: string
  name: string
  company: string | null
  tags: string[]
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const contacts = await db.contact.findMany({ orderBy: { createdAt: 'asc' } })
    const data: ContactListItem[] = contacts.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      company: c.company,
      tags: c.tags,
    }))
    return Response.json({ success: true, data } satisfies APIResponse<ContactListItem[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Contacts query failed' },
      { status: 500 }
    )
  }
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  linkedIn: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  // Optionally open a deal in the same call (kanban "add card").
  dealStage: z.enum(DEAL_STAGES).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid contact payload' }, { status: 400 })
    }
    const { dealStage, ...contactData } = parsed.data
    const contact = await db.contact.create({ data: contactData })
    if (dealStage) {
      await db.deal.create({
        data: {
          contactId: contact.id,
          title: `${contact.company ?? contact.firstName} deal`,
          stage: dealStage,
        },
      })
    }
    await audit('william_morrison', 'crm.contact.create', contact.id, {
      name: `${contact.firstName} ${contact.lastName}`,
    })
    return Response.json(
      { success: true, data: { id: contact.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Contact create failed' },
      { status: 500 }
    )
  }
}
