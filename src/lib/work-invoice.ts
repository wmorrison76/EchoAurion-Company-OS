/**
 * WorkAgreement → Stripe Invoice hooks.
 * Feature-flagged: no-op when STRIPE_SECRET_KEY missing.
 * Never stores card data — only invoice id + hosted URL.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

export interface InvoiceLinkResult {
  ok: boolean
  stripeInvoiceId: string | null
  stripeInvoiceUrl: string | null
  invoiceStatus: string | null
  mode: 'created' | 'linked' | 'skipped' | 'error'
  error?: string
}

/**
 * After authorize: create a Stripe Invoice when keys exist, or link a provided id.
 */
export async function linkOrCreateWorkInvoice(opts: {
  workAgreementId: string
  workRequestId: string
  quoteTotal: number | null | undefined
  clientKey: string
  signerEmail?: string | null
  /** Operator-provided existing Stripe invoice id. */
  stripeInvoiceId?: string | null
  actor?: 'william_morrison' | 'computer_agent'
}): Promise<InvoiceLinkResult> {
  const actor = opts.actor ?? 'computer_agent'
  const providedId = opts.stripeInvoiceId?.trim() || null

  if (providedId) {
    const url = `https://dashboard.stripe.com/invoices/${providedId}`
    await db.workAgreement.update({
      where: { id: opts.workAgreementId },
      data: {
        stripeInvoiceId: providedId,
        stripeInvoiceUrl: url,
        invoiceStatus: 'linked',
      },
    })
    await audit(actor, 'work.invoice.link', opts.workAgreementId, {
      stripeInvoiceId: providedId,
      workRequestId: opts.workRequestId,
    })
    return {
      ok: true,
      stripeInvoiceId: providedId,
      stripeInvoiceUrl: url,
      invoiceStatus: 'linked',
      mode: 'linked',
    }
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret) {
    return {
      ok: true,
      stripeInvoiceId: null,
      stripeInvoiceUrl: null,
      invoiceStatus: null,
      mode: 'skipped',
      error: 'STRIPE_SECRET_KEY unset — invoice create skipped',
    }
  }

  const amount = opts.quoteTotal
  if (amount == null || amount <= 0) {
    return {
      ok: true,
      stripeInvoiceId: null,
      stripeInvoiceUrl: null,
      invoiceStatus: null,
      mode: 'skipped',
      error: 'No quoteTotal — cannot create invoice',
    }
  }

  try {
    // Dynamic import keeps Stripe optional at build time when unused.
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' })

    let customerId: string | undefined
    if (opts.signerEmail?.trim()) {
      const customers = await stripe.customers.list({
        email: opts.signerEmail.trim(),
        limit: 1,
      })
      customerId =
        customers.data[0]?.id ??
        (
          await stripe.customers.create({
            email: opts.signerEmail.trim(),
            metadata: { clientKey: opts.clientKey, source: 'echoaurion_work_agreement' },
          })
        ).id
    } else {
      const customer = await stripe.customers.create({
        name: `Echo property ${opts.clientKey.slice(0, 24)}`,
        metadata: { clientKey: opts.clientKey, source: 'echoaurion_work_agreement' },
      })
      customerId = customer.id
    }

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 14,
      metadata: {
        workRequestId: opts.workRequestId,
        workAgreementId: opts.workAgreementId,
        clientKey: opts.clientKey,
      },
      auto_advance: false,
    })

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: Math.round(amount * 100),
      currency: 'usd',
      description: `EchoAurion WorkAgreement ${opts.workRequestId.slice(0, 8)}`,
    })

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id)

    await db.workAgreement.update({
      where: { id: opts.workAgreementId },
      data: {
        stripeInvoiceId: finalized.id,
        stripeInvoiceUrl: finalized.hosted_invoice_url ?? finalized.invoice_pdf ?? null,
        invoiceStatus: finalized.status ?? 'open',
      },
    })

    await audit(actor, 'work.invoice.create', opts.workAgreementId, {
      stripeInvoiceId: finalized.id,
      workRequestId: opts.workRequestId,
    })

    return {
      ok: true,
      stripeInvoiceId: finalized.id,
      stripeInvoiceUrl: finalized.hosted_invoice_url ?? null,
      invoiceStatus: finalized.status ?? 'open',
      mode: 'created',
    }
  } catch (err) {
    return {
      ok: false,
      stripeInvoiceId: null,
      stripeInvoiceUrl: null,
      invoiceStatus: null,
      mode: 'error',
      error: err instanceof Error ? err.message : 'Stripe invoice failed',
    }
  }
}
