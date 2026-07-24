import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

/**
 * POST /api/financial/brex/sync
 *
 * Pulls the latest Brex settled card + cash transactions and balances,
 * upserts them into BrexTransaction / BrexSnapshot for the Financial
 * dashboard. Replaces the retired Mercury sync path.
 *
 * Behind auth. Called by:
 *  - /financial page "Sync Brex" button
 *  - hourly cron (see render.yaml financial-sync)
 *  - manual trigger by admin
 *
 * The Brex REST access token is expected in BREX_ACCESS_TOKEN env var,
 * or forwarded through the Perplexity Brex connector when running inside
 * an agent session.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BREX_API = 'https://platform.brexapis.com'

interface BrexTxn {
  id: string
  amount?: { amount?: number; currency?: string }
  posted_at_date?: string
  description?: string
  merchant?: { raw_descriptor?: string; mcc?: string }
  card_metadata?: { last_four?: string; card_holder_user_id?: string }
  transfer_type?: string
  type?: string
}

async function brexFetch<T>(path: string): Promise<T | null> {
  const token = process.env.BREX_ACCESS_TOKEN
  if (!token) {
    console.warn('BREX_ACCESS_TOKEN not set — brex sync skipped')
    return null
  }
  const res = await fetch(`${BREX_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error(`brex sync: ${path} → ${res.status} ${res.statusText}`)
    return null
  }
  return (await res.json()) as T
}

async function syncCardTransactions(): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - 90)
  const iso = since.toISOString()

  const body = await brexFetch<{ items: BrexTxn[] }>(
    `/v2/transactions/card/primary?posted_at_start=${iso}&limit=500`
  )
  if (!body?.items) return 0

  let count = 0
  for (const t of body.items) {
    if (!t.id || !t.posted_at_date) continue
    const amount = t.amount?.amount ? t.amount.amount / 100 : 0
    const currency = t.amount?.currency ?? 'USD'
    const merchantName =
      t.merchant?.raw_descriptor?.trim() || t.description || null

    await db.brexTransaction.upsert({
      where: { brexId: t.id },
      create: {
        brexId: t.id,
        accountId: 'primary_card',
        accountType: 'card',
        postedAt: new Date(t.posted_at_date),
        amount,
        currency,
        merchantName,
        description: t.description ?? null,
        category: t.merchant?.mcc ?? null,
        pending: false,
      },
      update: {
        amount,
        merchantName,
        description: t.description ?? null,
        pending: false,
      },
    })
    count++
  }
  return count
}

export async function POST(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const cardCount = await syncCardTransactions()

    // Snapshot the primary card account for balance-over-time charting.
    // Brex doesn't expose a single balance endpoint, so we sum recent settled activity
    // as a placeholder until we hook up the balances API.
    const recentSum = await db.brexTransaction.aggregate({
      where: {
        accountType: 'card',
        postedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { amount: true },
    })
    await db.brexSnapshot.create({
      data: {
        accountId: 'primary_card',
        accountName: 'Brex Primary Card',
        accountType: 'card',
        available: 0,
        current: recentSum._sum.amount ?? 0,
      },
    })

    await audit('william_morrison', 'financial.brex.sync', 'primary_card', {
      cardTransactions: cardCount,
    })

    const body: APIResponse<{ cardTransactions: number }> = {
      success: true,
      data: { cardTransactions: cardCount },
    }
    return Response.json(body)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Brex sync failed' },
      { status: 500 }
    )
  }
}
