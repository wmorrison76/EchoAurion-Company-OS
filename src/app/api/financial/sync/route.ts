import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getAccounts, getTransactions, plaidConfigured } from '@/lib/plaid'
import { getMercuryAccounts, mercuryConfigured } from '@/lib/mercury'
import { getStripe, snapshotMRR } from '@/lib/stripe'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type SyncResult = {
  balanceSnapshots: number
  transactionsUpserted: number
  mercurySnapshots: number
  mrrSnapshot: boolean
}

// Daily sync (CLAUDE.md §12.1), invoked by a Render cron with a bearer secret.
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  if (!secret || authz !== `Bearer ${secret}`) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  const result: SyncResult = {
    balanceSnapshots: 0,
    transactionsUpserted: 0,
    mercurySnapshots: 0,
    mrrSnapshot: false,
  }

  try {
    if (plaidConfigured()) {
      const items = await db.plaidItem.findMany({ include: { accounts: true } })
      for (const item of items) {
        // Balances
        const accounts = await getAccounts(item.accessToken)
        for (const a of accounts) {
          const local = item.accounts.find((x) => x.plaidAccountId === a.account_id)
          if (!local) continue
          await db.balanceSnapshot.create({
            data: {
              accountId: local.id,
              available: a.balances.available ?? null,
              current: a.balances.current ?? 0,
              limit: a.balances.limit ?? null,
            },
          })
          result.balanceSnapshots += 1
        }

        // Transactions (past 7 days), upsert by plaidTransactionId
        const txns = await getTransactions(item.accessToken, 7)
        for (const t of txns) {
          const local = item.accounts.find((x) => x.plaidAccountId === t.account_id)
          if (!local) continue
          await db.transaction.upsert({
            where: { plaidTransactionId: t.transaction_id },
            create: {
              accountId: local.id,
              plaidTransactionId: t.transaction_id,
              amount: t.amount,
              date: new Date(t.date),
              name: t.name,
              merchantName: t.merchant_name ?? null,
              category: t.category ?? [],
              pending: t.pending,
            },
            update: {
              amount: t.amount,
              pending: t.pending,
              merchantName: t.merchant_name ?? null,
            },
          })
          result.transactionsUpserted += 1
        }
      }
    }

    if (mercuryConfigured()) {
      const accounts = await getMercuryAccounts()
      for (const a of accounts) {
        await db.mercurySnapshot.create({
          data: {
            accountId: a.id,
            accountName: a.name,
            available: a.availableBalance,
            current: a.currentBalance,
          },
        })
        result.mercurySnapshots += 1
      }
    }

    // Daily MRR snapshot (CLAUDE.md §14.1 — same cron).
    if (getStripe()) {
      await snapshotMRR()
      result.mrrSnapshot = true
      await audit('computer_agent', 'revenue.mrr.snapshot')
    }

    await audit('computer_agent', 'financial.sync', undefined, result)

    const body: APIResponse<SyncResult> = { success: true, data: result }
    return Response.json(body)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
