import Stripe from 'stripe'
import type { StripeMRRHealth } from '@/types/dr-os'

// Lazily instantiated so a missing key never crashes module import (panels must
// degrade gracefully — CLAUDE.md §18). Expanded further in Step 4 (§14).
let client: Stripe | null = null

export function getStripe(): Stripe | null {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  client = new Stripe(key, { apiVersion: '2024-06-20' })
  return client
}

export interface MRRResult {
  mrr: number
  customerCount: number
}

/** Sums active subscriptions, normalising every interval to monthly (§14.1). */
export async function calculateMRR(): Promise<MRRResult> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe not configured')

  const subscriptions = await stripe.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.items'],
  })

  let mrr = 0
  for (const sub of subscriptions.data) {
    for (const item of sub.items.data) {
      const amount = item.price.unit_amount ?? 0
      const interval = item.price.recurring?.interval
      const monthly =
        interval === 'year'
          ? amount / 12
          : interval === 'week'
            ? amount * 4.33
            : interval === 'day'
              ? amount * 30
              : amount
      mrr += (monthly * (item.quantity ?? 1)) / 100 // Stripe amounts are in cents
    }
  }

  return { mrr, customerCount: subscriptions.data.length }
}

/** Count of subscriptions canceled within the last `days` days (§14.5). */
export async function getChurnedCount(days = 90): Promise<number> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe not configured')
  const cutoff = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
  const canceled = await stripe.subscriptions.list({ status: 'canceled', limit: 100 })
  return canceled.data.filter((s) => (s.canceled_at ?? 0) >= cutoff).length
}

/** Persists a daily MRR snapshot (§14.1 — same cron as the financial sync). */
export async function snapshotMRR(): Promise<{ mrr: number; customerCount: number }> {
  const { db } = await import('@/lib/db')
  const { mrr, customerCount } = await calculateMRR()
  await db.mRRSnapshot.create({ data: { mrr, customerCount } })
  return { mrr, customerCount }
}

export async function getStripeMRRHealth(): Promise<StripeMRRHealth> {
  try {
    const { mrr, customerCount } = await calculateMRR()
    return {
      level: 'ok',
      label: 'Live',
      mrr,
      subscriptionCount: customerCount,
    }
  } catch (error) {
    return {
      level: 'unknown',
      label: 'Unavailable',
      mrr: 0,
      subscriptionCount: 0,
      error: error instanceof Error ? error.message : 'Stripe request failed',
    }
  }
}
