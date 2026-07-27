import type { StatusLevel } from '@/types'

// ── Financial Monitor payloads (CLAUDE.md §12) ──────────────────────────────

export interface BalanceCard {
  id: string
  name: string
  institution: string
  mask: string | null
  current: number
  available: number | null
  lastSynced: string | null
  level: StatusLevel
  statusLabel: 'Synced' | 'Stale' | 'Error' | 'Pending'
}

export interface BurnRate {
  thirtyDay: number
  sixtyDay: number
  ninetyDay: number
}

export interface RunwaySummary {
  totalCash: number
  monthlyBurn: number
  months: number | null
  oct1Date: string
  daysToOct1: number
  onTrack: boolean
  daysShort: number
}

export interface BillItem {
  id: string
  name: string
  amount: number
  dueDay: number
  category: string
  isActive: boolean
  notes: string | null
  dueSoon: boolean
}

export interface PLMonth {
  month: string // "2026-06"
  label: string // "Jun 2026"
  revenue: number
  expenses: number
  net: number
}

export interface TransactionItem {
  id: string
  accountName: string
  amount: number
  date: string
  name: string
  merchantName: string | null
  pending: boolean
}

export interface FinancialOverview {
  connected: boolean
  balances: BalanceCard[]
  burnRate: BurnRate
  runway: RunwaySummary
  bills: BillItem[]
  pl: PLMonth[]
  recentTransactions: TransactionItem[]
  generatedAt: string
}
