import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { removeItem } from '@/lib/plaid'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

// Revoke a Plaid item and delete its local records (CLAUDE.md §12.1).
export async function DELETE(
  _req: Request,
  { params }: { params: { itemId: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const item = await db.plaidItem.findUnique({
      where: { id: params.itemId },
      include: { accounts: true },
    })
    if (!item) {
      return Response.json({ success: false, error: 'Item not found' }, { status: 404 })
    }

    await removeItem(item.accessToken).catch(() => {
      // Best-effort revoke with Plaid; still purge locally.
    })

    const accountIds = item.accounts.map((a) => a.id)
    await db.$transaction([
      db.balanceSnapshot.deleteMany({ where: { accountId: { in: accountIds } } }),
      db.transaction.deleteMany({ where: { accountId: { in: accountIds } } }),
      db.plaidAccount.deleteMany({ where: { itemId: item.id } }),
      db.plaidItem.delete({ where: { id: item.id } }),
    ])

    await audit('william_morrison', 'financial.plaid.disconnect', item.id, {
      institutionName: item.institutionName,
    })

    const body: APIResponse<{ removed: true }> = { success: true, data: { removed: true } }
    return Response.json(body)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Remove failed' },
      { status: 500 }
    )
  }
}
