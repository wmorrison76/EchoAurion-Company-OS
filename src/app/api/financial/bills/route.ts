import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'
import type { BillItem } from '@/types/financial'

export const dynamic = 'force-dynamic'

function toItem(b: {
  id: string
  name: string
  amount: number
  dueDay: number
  category: string
  isActive: boolean
  notes: string | null
}): BillItem {
  const today = new Date().getDate()
  const delta = b.dueDay >= today ? b.dueDay - today : b.dueDay + 30 - today
  return { ...b, dueSoon: delta <= 7 }
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const bills = await db.bill.findMany({ where: { isActive: true }, orderBy: { dueDay: 'asc' } })
    const body: APIResponse<BillItem[]> = { success: true, data: bills.map(toItem) }
    return Response.json(body)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Bills query failed' },
      { status: 500 }
    )
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  dueDay: z.number().int().min(1).max(31),
  category: z.enum(['rent', 'subscription', 'software', 'other']),
  notes: z.string().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid bill payload' }, { status: 400 })
    }
    const bill = await db.bill.create({
      data: { ...parsed.data, notes: parsed.data.notes ?? null },
    })
    await audit('william_morrison', 'financial.bill.create', bill.id, { name: bill.name })
    const body: APIResponse<BillItem> = { success: true, data: toItem(bill) }
    return Response.json(body, { status: 201 })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Bill create failed' },
      { status: 500 }
    )
  }
}
