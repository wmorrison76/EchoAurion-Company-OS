import { db } from '@/lib/db'
import { isRentSplitPay, rentSplitMonthlyTotal } from '@/lib/rent-split'
import type { StatusLevel } from '@/types'
import type {
  BalanceCard,
  BillItem,
  BurnRate,
  FinancialOverview,
  PLMonth,
  RunwaySummary,
  TransactionItem,
} from '@/types/financial'

const DAY_MS = 24 * 60 * 60 * 1000

// Plaid sign convention: a POSITIVE amount is money leaving the account
// (a debit / expense); negative is an inflow. (CLAUDE.md §12.3)
const isDebit = (amount: number) => amount > 0

function syncStatus(lastSynced: Date | null): { level: StatusLevel; label: BalanceCard['statusLabel'] } {
  if (!lastSynced) return { level: 'error', label: 'Error' }
  const age = Date.now() - lastSynced.getTime()
  if (age > DAY_MS) return { level: 'warn', label: 'Stale' }
  return { level: 'ok', label: 'Synced' }
}

async function getBalances(): Promise<BalanceCard[]> {
  const cards: BalanceCard[] = []

  // Plaid accounts: latest balance snapshot each.
  const accounts = await db.plaidAccount.findMany({
    include: {
      item: true,
      balanceSnapshots: { orderBy: { snappedAt: 'desc' }, take: 1 },
    },
  })
  for (const acct of accounts) {
    const snap = acct.balanceSnapshots[0]
    const { level, label } = syncStatus(snap?.snappedAt ?? null)
    cards.push({
      id: acct.id,
      name: acct.name,
      institution: acct.item.institutionName,
      mask: acct.mask,
      current: snap?.current ?? 0,
      available: snap?.available ?? null,
      lastSynced: snap?.snappedAt.toISOString() ?? null,
      level,
      statusLabel: label,
    })
  }

  // Mercury: latest snapshot per account id.
  const mercury = await db.mercurySnapshot.findMany({ orderBy: { snappedAt: 'desc' } })
  const seen = new Set<string>()
  for (const m of mercury) {
    if (seen.has(m.accountId)) continue
    seen.add(m.accountId)
    const { level, label } = syncStatus(m.snappedAt)
    cards.push({
      id: `mercury-${m.accountId}`,
      name: m.accountName,
      institution: 'Mercury',
      mask: m.accountId.slice(-4),
      current: m.current,
      available: m.available,
      lastSynced: m.snappedAt.toISOString(),
      level,
      statusLabel: label,
    })
  }

  return cards
}

async function getBurnRate(): Promise<BurnRate> {
  const since = new Date(Date.now() - 90 * DAY_MS)
  const txns = await db.transaction.findMany({
    where: { date: { gte: since }, pending: false },
    select: { amount: true, date: true },
  })

  const sumDebits = (days: number) => {
    const cutoff = Date.now() - days * DAY_MS
    const total = txns
      .filter((t) => t.date.getTime() >= cutoff && isDebit(t.amount))
      .reduce((s, t) => s + t.amount, 0)
    return (total / days) * 30 // normalise to monthly
  }

  return { thirtyDay: sumDebits(30), sixtyDay: sumDebits(60), ninetyDay: sumDebits(90) }
}

function nextOct1(): Date {
  const now = new Date()
  const year = now.getMonth() > 9 || (now.getMonth() === 9 && now.getDate() >= 1) ? now.getFullYear() + 1 : now.getFullYear()
  // Target is October 1 of the current cycle.
  const thisYear = new Date(now.getFullYear(), 9, 1)
  return now <= thisYear ? thisYear : new Date(year, 9, 1)
}

function getRunway(balances: BalanceCard[], burn: BurnRate): RunwaySummary {
  const totalCash = balances.reduce((s, b) => s + b.current, 0)
  const monthlyBurn = burn.ninetyDay // 90-day average is most reliable (§12.3)
  const months = monthlyBurn > 0 ? totalCash / monthlyBurn : null

  const oct1 = nextOct1()
  const daysToOct1 = Math.ceil((oct1.getTime() - Date.now()) / DAY_MS)
  const runwayDays = months !== null ? months * 30 : Infinity
  const onTrack = runwayDays >= daysToOct1
  const daysShort = onTrack ? 0 : Math.max(0, Math.ceil(daysToOct1 - runwayDays))

  return {
    totalCash,
    monthlyBurn,
    months,
    oct1Date: oct1.toISOString(),
    daysToOct1,
    onTrack,
    daysShort,
  }
}

async function getBills(): Promise<BillItem[]> {
  const bills = await db.bill.findMany({ where: { isActive: true }, orderBy: { dueDay: 'asc' } })
  const today = new Date().getDate()
  return bills.map((b) => {
    // Days until the next occurrence of dueDay this/next month.
    const delta = b.dueDay >= today ? b.dueDay - today : b.dueDay + 30 - today
    return {
      id: b.id,
      name: b.name,
      amount: b.amount,
      dueDay: b.dueDay,
      category: b.category,
      isActive: b.isActive,
      notes: b.notes,
      dueSoon: delta <= 7,
    }
  })
}

async function getPL(months: number): Promise<PLMonth[]> {
  const start = new Date()
  start.setMonth(start.getMonth() - (months - 1))
  start.setDate(1)
  start.setHours(0, 0, 0, 0)

  const [txns, mrr] = await Promise.all([
    db.transaction.findMany({ where: { date: { gte: start }, pending: false } }),
    db.mRRSnapshot.findMany({ where: { snappedAt: { gte: start } }, orderBy: { snappedAt: 'asc' } }),
  ])

  const buckets = new Map<string, PLMonth>()
  for (let i = 0; i < months; i++) {
    const d = new Date(start)
    d.setMonth(start.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.set(key, {
      month: key,
      label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      revenue: 0,
      expenses: 0,
      net: 0,
    })
  }

  for (const t of txns) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`
    const bucket = buckets.get(key)
    if (bucket && isDebit(t.amount)) bucket.expenses += t.amount
  }

  // Use the latest MRR snapshot within each month as that month's revenue.
  const monthlyMrr = new Map<string, number>()
  for (const m of mrr) {
    const key = `${m.snappedAt.getFullYear()}-${String(m.snappedAt.getMonth() + 1).padStart(2, '0')}`
    monthlyMrr.set(key, m.mrr)
  }
  for (const [key, value] of monthlyMrr) {
    const bucket = buckets.get(key)
    if (bucket) bucket.revenue = value
  }

  return Array.from(buckets.values()).map((b) => ({ ...b, net: b.revenue - b.expenses }))
}

async function getRecentTransactions(limit: number): Promise<TransactionItem[]> {
  const txns = await db.transaction.findMany({
    orderBy: { date: 'desc' },
    take: limit,
    include: { account: true },
  })
  return txns.map((t) => ({
    id: t.id,
    accountName: t.account.name,
    amount: t.amount,
    date: t.date.toISOString(),
    name: t.name,
    merchantName: t.merchantName,
    pending: t.pending,
    rentSplit: isRentSplitPay({
      name: t.name,
      merchantName: t.merchantName,
      amount: t.amount,
    }),
  }))
}

async function getRentSplitMonthlyTotal(): Promise<number> {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const txns = await db.transaction.findMany({
    where: { date: { gte: start } },
    select: { name: true, merchantName: true, amount: true, date: true },
  })
  return rentSplitMonthlyTotal(txns, now)
}

const EMPTY: Omit<FinancialOverview, 'generatedAt'> = {
  connected: false,
  balances: [],
  burnRate: { thirtyDay: 0, sixtyDay: 0, ninetyDay: 0 },
  runway: {
    totalCash: 0,
    monthlyBurn: 0,
    months: null,
    oct1Date: '',
    daysToOct1: 0,
    onTrack: true,
    daysShort: 0,
  },
  bills: [],
  pl: [],
  recentTransactions: [],
  rentSplitMonthlyTotal: 0,
}

export async function getFinancialOverview(): Promise<FinancialOverview> {
  try {
    const itemCount = await db.plaidItem.count()
    const [balances, burnRate, bills, pl, recentTransactions, rentSplit] = await Promise.all([
      getBalances(),
      getBurnRate(),
      getBills(),
      getPL(6),
      getRecentTransactions(15),
      getRentSplitMonthlyTotal(),
    ])
    const runway = getRunway(balances, burnRate)
    return {
      connected: itemCount > 0 || balances.length > 0,
      balances,
      burnRate,
      runway,
      bills,
      pl,
      recentTransactions,
      rentSplitMonthlyTotal: rentSplit,
      generatedAt: new Date().toISOString(),
    }
  } catch {
    // DB unreachable — degrade to a not-connected state (§18).
    return { ...EMPTY, generatedAt: new Date().toISOString() }
  }
}
