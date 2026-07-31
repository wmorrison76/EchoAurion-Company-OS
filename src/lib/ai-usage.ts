/**
 * Real AI usage metering + budgets (docs/CUSTOMER_AI_COST.md — token metering).
 *
 * `recordAiUsage` is called from the connector layer with the provider's own
 * `usage` counts; cost comes from the per-model rate table below. Rows are
 * per-call, per-tenant (clientKey null = owner/internal), so both the
 * per-account view and the owner rollup come from the same source of truth.
 *
 * Budgets (monthly, UTC calendar month):
 *   AI_BUDGET_CLIENT_USD_MONTH — per tenant (default 100)
 *   AI_BUDGET_OWNER_USD_MONTH  — everything combined (default 1000)
 *   AI_BUDGET_HARD_STOP        — on|off (default off): exceeded owner budget
 *                                blocks new LLM calls (Knights degrade to
 *                                UNAVAILABLE instead of silently spending).
 * Alerts fire from the daily cost-anomaly cron via scanAiBudgets().
 */

import { db } from '@/lib/db'
import { raiseAlert } from '@/lib/alerts'

export interface AiUsage {
  promptTokens: number
  completionTokens: number
  estimated?: boolean
}

/** USD per 1M tokens {in, out}; first prefix match wins, then provider default. */
const PRICES: Array<{ prefix: string; inPerM: number; outPerM: number }> = [
  { prefix: 'gpt-4o-mini', inPerM: 0.15, outPerM: 0.6 },
  { prefix: 'gpt-4o', inPerM: 2.5, outPerM: 10 },
  { prefix: 'gpt-4.1-mini', inPerM: 0.4, outPerM: 1.6 },
  { prefix: 'gpt-4.1', inPerM: 2, outPerM: 8 },
  { prefix: 'o3', inPerM: 2, outPerM: 8 },
  { prefix: 'claude-opus', inPerM: 15, outPerM: 75 },
  { prefix: 'claude-sonnet', inPerM: 3, outPerM: 15 },
  { prefix: 'claude-haiku', inPerM: 0.8, outPerM: 4 },
  { prefix: 'claude-3-5-haiku', inPerM: 0.8, outPerM: 4 },
  { prefix: 'gemini-1.5-flash', inPerM: 0.15, outPerM: 0.6 },
  { prefix: 'gemini-2.5-flash', inPerM: 0.3, outPerM: 2.5 },
  { prefix: 'gemini-2.0-flash', inPerM: 0.1, outPerM: 0.4 },
  { prefix: 'gemini', inPerM: 1.25, outPerM: 5 },
  { prefix: 'sonar', inPerM: 1, outPerM: 1 },
]

const PROVIDER_DEFAULT: Record<string, { inPerM: number; outPerM: number }> = {
  openai: { inPerM: 2.5, outPerM: 10 },
  anthropic: { inPerM: 3, outPerM: 15 },
  google: { inPerM: 1.25, outPerM: 5 },
  perplexity: { inPerM: 1, outPerM: 1 },
  echo: { inPerM: 0, outPerM: 0 }, // internal proxy — billed on the product side
}

export function priceUsd(provider: string, model: string, usage: AiUsage): number {
  const rate =
    PRICES.find((p) => model.toLowerCase().startsWith(p.prefix)) ??
    PROVIDER_DEFAULT[provider] ?? { inPerM: 2, outPerM: 8 }
  return (
    (usage.promptTokens / 1_000_000) * rate.inPerM +
    (usage.completionTokens / 1_000_000) * rate.outPerM
  )
}

export interface AiAttribution {
  clientKey?: string | null
  feature?: string
}

/** Best-effort insert — metering must never break an LLM call. */
export async function recordAiUsage(input: {
  provider: string
  model: string
  usage: AiUsage
  attribution?: AiAttribution
}): Promise<void> {
  const costUsd = priceUsd(input.provider, input.model, input.usage)
  await db.aiUsageEvent
    .create({
      data: {
        provider: input.provider,
        model: input.model,
        promptTokens: Math.max(0, Math.round(input.usage.promptTokens)),
        completionTokens: Math.max(0, Math.round(input.usage.completionTokens)),
        estimated: Boolean(input.usage.estimated),
        costUsd,
        clientKey: input.attribution?.clientKey ?? null,
        feature: input.attribution?.feature ?? null,
      },
    })
    .catch((err) => console.error('[ai-usage] record failed', err))
}

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export function clientBudgetUsd(): number {
  return Number(process.env.AI_BUDGET_CLIENT_USD_MONTH ?? 100)
}
export function ownerBudgetUsd(): number {
  return Number(process.env.AI_BUDGET_OWNER_USD_MONTH ?? 1000)
}
export function hardStopEnabled(): boolean {
  return ['on', 'true', '1'].includes((process.env.AI_BUDGET_HARD_STOP ?? 'off').toLowerCase())
}

export async function aiSpendThisMonth(clientKey?: string | null): Promise<number> {
  const agg = await db.aiUsageEvent
    .aggregate({
      where: {
        createdAt: { gte: monthStart() },
        ...(clientKey !== undefined ? { clientKey } : {}),
      },
      _sum: { costUsd: true },
    })
    .catch(() => null)
  return agg?._sum.costUsd ?? 0
}

/**
 * Pre-call gate. Only blocks when AI_BUDGET_HARD_STOP=on and the OWNER
 * monthly budget is exceeded — per-client overruns alert but never silently
 * degrade one tenant's support.
 */
export async function aiCallAllowed(): Promise<{ ok: boolean; reason?: string }> {
  if (!hardStopEnabled()) return { ok: true }
  const spent = await aiSpendThisMonth()
  const cap = ownerBudgetUsd()
  if (cap > 0 && spent >= cap) {
    return {
      ok: false,
      reason: `AI monthly budget exhausted ($${spent.toFixed(2)} of $${cap}) — AI_BUDGET_HARD_STOP is on`,
    }
  }
  return { ok: true }
}

/** Daily budget scan (cost-anomaly cron). Warn at 80%, critical at 100%. */
export async function scanAiBudgets(): Promise<{
  ownerSpentUsd: number
  ownerCapUsd: number
  clientAlerts: number
}> {
  const start = monthStart()
  const ownerSpent = await aiSpendThisMonth()
  const ownerCap = ownerBudgetUsd()
  let clientAlerts = 0

  if (ownerCap > 0 && ownerSpent >= ownerCap * 0.8) {
    await raiseAlert({
      kind: 'system',
      severity: ownerSpent >= ownerCap ? 'CRITICAL' : 'WARN',
      title:
        ownerSpent >= ownerCap
          ? `AI budget EXCEEDED: $${ownerSpent.toFixed(2)} / $${ownerCap} this month`
          : `AI budget at ${Math.round((ownerSpent / ownerCap) * 100)}%: $${ownerSpent.toFixed(2)} / $${ownerCap}`,
      body: `Owner-level AI spend (all providers, all tenants) since ${start.toISOString().slice(0, 10)}. Caps: AI_BUDGET_OWNER_USD_MONTH. Hard stop: ${hardStopEnabled() ? 'ON' : 'off'}.`,
      entityRef: `ai-budget-owner-${start.toISOString().slice(0, 7)}`,
    }).catch(() => {})
  }

  const clientCap = clientBudgetUsd()
  if (clientCap > 0) {
    const byClient = await db.aiUsageEvent
      .groupBy({
        by: ['clientKey'],
        where: { createdAt: { gte: start }, clientKey: { not: null } },
        _sum: { costUsd: true },
      })
      .catch(() => [])
    for (const row of byClient) {
      const spent = row._sum.costUsd ?? 0
      if (spent >= clientCap * 0.8 && row.clientKey) {
        clientAlerts += 1
        await raiseAlert({
          kind: 'system',
          severity: spent >= clientCap ? 'CRITICAL' : 'WARN',
          title: `Tenant AI spend ${spent >= clientCap ? 'over' : 'nearing'} budget: ${row.clientKey}`,
          body: `$${spent.toFixed(2)} of $${clientCap} this month (AI_BUDGET_CLIENT_USD_MONTH).`,
          entityRef: `ai-budget-${row.clientKey}-${start.toISOString().slice(0, 7)}`,
        }).catch(() => {})
      }
    }
  }

  return { ownerSpentUsd: ownerSpent, ownerCapUsd: ownerCap, clientAlerts }
}

/** Rollup for the Fleet Nexus AI-usage panel. */
export async function aiUsageSummary(days = 30): Promise<{
  sinceIso: string
  totalCostUsd: number
  totalPromptTokens: number
  totalCompletionTokens: number
  monthSpendUsd: number
  ownerCapUsd: number
  clientCapUsd: number
  byProviderModel: Array<{
    provider: string
    model: string
    calls: number
    promptTokens: number
    completionTokens: number
    costUsd: number
  }>
  byClient: Array<{ clientKey: string | null; calls: number; costUsd: number }>
}> {
  const since = new Date(Date.now() - days * 86_400_000)

  const [byPm, byClient, totals, monthSpend] = await Promise.all([
    db.aiUsageEvent.groupBy({
      by: ['provider', 'model'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, costUsd: true },
    }),
    db.aiUsageEvent.groupBy({
      by: ['clientKey'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
    db.aiUsageEvent.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { promptTokens: true, completionTokens: true, costUsd: true },
    }),
    aiSpendThisMonth(),
  ])

  return {
    sinceIso: since.toISOString(),
    totalCostUsd: totals._sum.costUsd ?? 0,
    totalPromptTokens: totals._sum.promptTokens ?? 0,
    totalCompletionTokens: totals._sum.completionTokens ?? 0,
    monthSpendUsd: monthSpend,
    ownerCapUsd: ownerBudgetUsd(),
    clientCapUsd: clientBudgetUsd(),
    byProviderModel: byPm
      .map((r) => ({
        provider: r.provider,
        model: r.model,
        calls: r._count._all,
        promptTokens: r._sum.promptTokens ?? 0,
        completionTokens: r._sum.completionTokens ?? 0,
        costUsd: r._sum.costUsd ?? 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byClient: byClient
      .map((r) => ({
        clientKey: r.clientKey,
        calls: r._count._all,
        costUsd: r._sum.costUsd ?? 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 25),
  }
}
