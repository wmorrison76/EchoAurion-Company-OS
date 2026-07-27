import { z } from 'zod'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface ContactView {
  id: string
  clientKey: string
  name: string
  email: string | null
  active: boolean
  tokenLast4: string
  createdAt: string
}

// Designated billing contacts per property — the only profiles allowed to
// authorize spend. Tokens are shown in full only at creation.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const contacts = await db.billingContact.findMany({ orderBy: { createdAt: 'desc' } })
    const data: ContactView[] = contacts.map((c) => ({
      id: c.id,
      clientKey: c.clientKey,
      name: c.name,
      email: c.email,
      active: c.active,
      tokenLast4: c.token.slice(-4),
      createdAt: c.createdAt.toISOString(),
    }))
    return Response.json({ success: true, data } satisfies APIResponse<ContactView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Contacts query failed' },
      { status: 500 }
    )
  }
}

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid contact payload' }, { status: 400 })
    }
    const token = randomBytes(24).toString('hex')
    const created = await db.billingContact.create({
      data: {
        clientKey: parsed.data.clientKey,
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        token,
      },
    })
    await audit('william_morrison', 'work.billing_contact.create', created.id, {
      clientKey: parsed.data.clientKey,
    })
    // Token returned in full exactly once.
    return Response.json(
      { success: true, data: { id: created.id, token } } satisfies APIResponse<{
        id: string
        token: string
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Contact create failed' },
      { status: 500 }
    )
  }
}
