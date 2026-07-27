// Mercury read-only API wrapper (CLAUDE.md §12.2). Never attempt writes (§22.5).
const MERCURY_BASE = 'https://api.mercury.com/api/v1'

export function mercuryConfigured(): boolean {
  return Boolean(process.env.MERCURY_API_KEY)
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.MERCURY_API_KEY}`,
    Accept: 'application/json',
  }
}

export interface MercuryAccount {
  id: string
  name: string
  accountNumber?: string
  availableBalance: number
  currentBalance: number
}

interface MercuryAccountsResponse {
  accounts: Array<{
    id: string
    name: string
    accountNumber?: string
    availableBalance: number
    currentBalance: number
  }>
}

export async function getMercuryAccounts(): Promise<MercuryAccount[]> {
  if (!mercuryConfigured()) throw new Error('Mercury not configured')
  const res = await fetch(`${MERCURY_BASE}/accounts`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`)
  const body = (await res.json()) as MercuryAccountsResponse
  return body.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    accountNumber: a.accountNumber,
    availableBalance: a.availableBalance,
    currentBalance: a.currentBalance,
  }))
}

export async function getMercuryTransactions(
  accountId: string,
  params: { start: string; end: string; limit?: number }
): Promise<unknown> {
  if (!mercuryConfigured()) throw new Error('Mercury not configured')
  const url = new URL(`${MERCURY_BASE}/account/${accountId}/transactions`)
  url.searchParams.set('start', params.start)
  url.searchParams.set('end', params.end)
  url.searchParams.set('limit', String(params.limit ?? 500))
  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`)
  return res.json()
}
