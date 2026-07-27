/** Client-safe spend cap helpers (env only — no DB). */

export function buildSpendCapUsd(): number {
  const n = Number(process.env.BUILD_SPEND_CAP_USD ?? process.env.NEXT_PUBLIC_BUILD_SPEND_CAP_USD ?? '5000')
  if (!Number.isFinite(n) || n < 0) return 5000
  return Math.floor(n)
}
