import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { exchangePublicToken, getAccounts, getInstitutionName } from '@/lib/plaid'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  publicToken: z.string().min(1),
  accountType: z.enum(['personal_checking', 'business_checking']).default('business_checking'),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }

    const { accessToken, itemId } = await exchangePublicToken(parsed.data.publicToken)
    const [institutionName, accounts] = await Promise.all([
      getInstitutionName(accessToken).catch(() => 'Unknown Institution'),
      getAccounts(accessToken),
    ])

    const item = await db.plaidItem.create({
      data: {
        itemId,
        accessToken,
        institutionName,
        accountType: parsed.data.accountType,
        accounts: {
          create: accounts.map((a) => ({
            plaidAccountId: a.account_id,
            name: a.name,
            type: String(a.type),
            subtype: a.subtype ? String(a.subtype) : null,
            mask: a.mask ?? null,
          })),
        },
      },
      include: { accounts: true },
    })

    // Seed an initial balance snapshot for each account.
    await Promise.all(
      accounts.map((a) => {
        const local = item.accounts.find((x) => x.plaidAccountId === a.account_id)
        if (!local) return Promise.resolve()
        return db.balanceSnapshot.create({
          data: {
            accountId: local.id,
            available: a.balances.available ?? null,
            current: a.balances.current ?? 0,
            limit: a.balances.limit ?? null,
          },
        })
      })
    )

    await audit('william_morrison', 'financial.plaid.connect', item.id, { institutionName })

    const body: APIResponse<{ itemId: string; accounts: number }> = {
      success: true,
      data: { itemId, accounts: accounts.length },
    }
    return Response.json(body, { status: 201 })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Exchange failed' },
      { status: 500 }
    )
  }
}
