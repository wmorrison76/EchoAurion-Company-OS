import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type Transaction as PlaidTransaction,
  type AccountBase,
} from 'plaid'

// Lazily build the client so a missing key never crashes module import; the
// /financial page must still render its "Connect Account" state (§12, §18).
let client: PlaidApi | null = null

export function getPlaidClient(): PlaidApi | null {
  if (client) return client
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) return null

  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  const config = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  client = new PlaidApi(config)
  return client
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET)
}

export async function createLinkToken(): Promise<string> {
  const plaid = getPlaidClient()
  if (!plaid) throw new Error('Plaid not configured')
  const res = await plaid.linkTokenCreate({
    user: { client_user_id: 'william_morrison' },
    client_name: 'EchoAurion Company OS',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: process.env.PLAID_WEBHOOK_URL,
  })
  return res.data.link_token
}

export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  const plaid = getPlaidClient()
  if (!plaid) throw new Error('Plaid not configured')
  const res = await plaid.itemPublicTokenExchange({ public_token: publicToken })
  return { accessToken: res.data.access_token, itemId: res.data.item_id }
}

export async function getAccounts(accessToken: string): Promise<AccountBase[]> {
  const plaid = getPlaidClient()
  if (!plaid) throw new Error('Plaid not configured')
  const res = await plaid.accountsBalanceGet({ access_token: accessToken })
  return res.data.accounts
}

export async function getInstitutionName(accessToken: string): Promise<string> {
  const plaid = getPlaidClient()
  if (!plaid) throw new Error('Plaid not configured')
  const item = await plaid.itemGet({ access_token: accessToken })
  const institutionId = item.data.item.institution_id
  if (!institutionId) return 'Unknown Institution'
  const inst = await plaid.institutionsGetById({
    institution_id: institutionId,
    country_codes: [CountryCode.Us],
  })
  return inst.data.institution.name
}

/** Pulls transactions for the last `days` days, following pagination. */
export async function getTransactions(
  accessToken: string,
  days: number
): Promise<PlaidTransaction[]> {
  const plaid = getPlaidClient()
  if (!plaid) throw new Error('Plaid not configured')

  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const all: PlaidTransaction[] = []
  let offset = 0
  for (;;) {
    const res = await plaid.transactionsGet({
      access_token: accessToken,
      start_date: fmt(start),
      end_date: fmt(end),
      options: { count: 500, offset },
    })
    all.push(...res.data.transactions)
    if (all.length >= res.data.total_transactions) break
    offset = all.length
  }
  return all
}

export async function removeItem(accessToken: string): Promise<void> {
  const plaid = getPlaidClient()
  if (!plaid) throw new Error('Plaid not configured')
  await plaid.itemRemove({ access_token: accessToken })
}
