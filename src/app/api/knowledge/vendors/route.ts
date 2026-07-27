import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const rows = await db.vendorAccessRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const data = rows.map((r) => ({
      id: r.id,
      vendorName: r.vendorName,
      contactEmail: r.contactEmail,
      useCase: r.useCase,
      scopeNotes: r.scopeNotes,
      status: r.status,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
    return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Vendor access query failed',
      },
      { status: 500 }
    )
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  op: z.enum(['approve', 'deny', 'revoke']),
})

/** Approve / deny / revoke stub — second scrutiny gate for vendors. */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid vendor access patch' }, { status: 400 })
    }
    const { id, op } = parsed.data
    const status =
      op === 'approve' ? 'APPROVED' : op === 'deny' ? 'DENIED' : 'REVOKED'

    const updated = await db.vendorAccessRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy: 'william_morrison',
        reviewedAt: new Date(),
        actor: 'william_morrison',
      },
    })

    await audit('william_morrison', `knowledge.vendor.${op}`, id, { status })

    return Response.json({
      success: true,
      data: { id: updated.id, status: updated.status },
    } satisfies APIResponse<{ id: string; status: string }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Vendor access update failed',
      },
      { status: 500 }
    )
  }
}

const createSchema = z.object({
  vendorName: z.string().min(1).max(200),
  contactEmail: z.string().email().optional(),
  useCase: z.string().min(1).max(2000),
  scopeNotes: z.string().max(2000).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid vendor request' }, { status: 400 })
    }
    const d = parsed.data
    const created = await db.vendorAccessRequest.create({
      data: {
        vendorName: d.vendorName,
        contactEmail: d.contactEmail ?? null,
        useCase: d.useCase,
        scopeNotes: d.scopeNotes ?? null,
        actor: 'william_morrison',
      },
    })
    await audit('william_morrison', 'knowledge.vendor.request', created.id)
    return Response.json(
      { success: true, data: { id: created.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Vendor request create failed',
      },
      { status: 500 }
    )
  }
}
