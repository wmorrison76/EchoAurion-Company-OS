/**
 * Billing-contact portal — quote history + WorkAgreement status without Dr. OS login.
 * Auth = BillingContact.token (shown once at create). Never expose full tokens in lists.
 */

import { db } from '@/lib/db'
import { WORK_STATUS_LABEL, type WorkStatus } from '@/types/work'

export interface BillingPortalQuote {
  id: string
  title: string
  kind: string
  status: WorkStatus
  statusLabel: string
  tier: string | null
  quoteTotal: number | null
  authorizedAt: string | null
  executedAt: string | null
  hasAgreement: boolean
  invoiceStatus: string | null
  invoiceUrl: string | null
  createdAt: string
}

export interface BillingPortalView {
  contactName: string
  clientKey: string
  quotes: BillingPortalQuote[]
}

export async function loadBillingPortal(
  token: string
): Promise<
  | { ok: true; data: BillingPortalView }
  | { ok: false; error: string; status: number; code?: string }
> {
  const trimmed = token.trim()
  if (!trimmed || trimmed.length < 16) {
    return { ok: false, error: 'Invalid credentials', status: 401, code: 'UNAUTHORIZED' }
  }

  const contact = await db.billingContact.findUnique({ where: { token: trimmed } })
  if (!contact || !contact.active) {
    return { ok: false, error: 'Invalid credentials', status: 401, code: 'UNAUTHORIZED' }
  }

  const rows = await db.workRequest.findMany({
    where: { clientKey: contact.clientKey },
    include: { agreement: true },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })

  const quotes: BillingPortalQuote[] = rows.map((w) => ({
    id: w.id,
    title: w.title,
    kind: w.kind,
    status: w.status as WorkStatus,
    statusLabel: WORK_STATUS_LABEL[w.status as WorkStatus] ?? w.status,
    tier: w.tier,
    quoteTotal: w.quoteTotal,
    authorizedAt: w.authorizedAt?.toISOString() ?? null,
    executedAt: w.executedAt?.toISOString() ?? null,
    hasAgreement: Boolean(w.agreement),
    invoiceStatus: w.agreement?.invoiceStatus ?? null,
    invoiceUrl: w.agreement?.stripeInvoiceUrl ?? null,
    createdAt: w.createdAt.toISOString(),
  }))

  return {
    ok: true,
    data: {
      contactName: contact.name,
      clientKey: contact.clientKey,
      quotes,
    },
  }
}
