import { BillingPortalClient } from '@/components/portal/BillingPortalClient'

export const metadata = {
  title: 'Billing portal · EchoAurion',
  description: 'Quote history and WorkAgreement status for billing contacts.',
  robots: { index: false, follow: false },
}

export default function BillingPortalPage() {
  return <BillingPortalClient />
}
