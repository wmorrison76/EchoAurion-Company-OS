'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { statusFetcher, auditFetcher, isUnauthorized } from '@/lib/fetchers'
import { SystemStatusPanel } from './SystemStatusPanel'
import { GitHubHealthPanel } from './GitHubHealthPanel'
import { RenderDeployPanel } from './RenderDeployPanel'
import { NeonDBPanel } from './NeonDBPanel'
import { StripeMRRPanel } from './StripeMRRPanel'
import { ActiveUsersPanel } from './ActiveUsersPanel'
import { PilotStatusPanel } from './PilotStatusPanel'
import { PilotConnectionPanel } from './PilotConnectionPanel'
import { ConfigDebtPanel } from './ConfigDebtPanel'
import { AuditTrailPanel } from './AuditTrailPanel'
import { ContextualHelpWidget } from './ContextualHelpWidget'
import { LabInstallLinks } from '@/components/layout/LabInstallLinks'
import { SupportReliabilityPanel } from './SupportReliabilityPanel'
import { DeadLetterDrainChip } from './DeadLetterDrainChip'
import { KnightsWatchingChip } from '@/components/help-desk/KnightsWatchingChip'
import { NightCleanerChip } from './NightCleanerChip'
import { HelpEvalChip } from './HelpEvalChip'
import { CostAnomalyChip } from './CostAnomalyChip'
import { MoleKnightsAuditPanel } from './MoleKnightsAuditPanel'
import { NerveCenterLinks } from './NerveCenterLinks'

export function DrOsDashboard() {
  const router = useRouter()

  const status = useSWR('/api/dr-os/status', statusFetcher, {
    refreshInterval: 60_000, // §10.4 — reconnect each 60s poll
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const audit = useSWR('/api/dr-os/audit', auditFetcher, {
    refreshInterval: 30_000, // §10.3 — 30s polling
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  // 401 anywhere → session expired → back to login.
  useEffect(() => {
    if (isUnauthorized(status.error) || isUnauthorized(audit.error)) {
      router.replace('/login')
    }
  }, [status.error, audit.error, router])

  const statusError =
    status.error && !isUnauthorized(status.error)
      ? status.error instanceof Error
        ? status.error.message
        : 'Status unavailable'
      : null

  const auditError =
    audit.error && !isUnauthorized(audit.error)
      ? audit.error instanceof Error
        ? audit.error.message
        : 'Audit unavailable'
      : undefined

  return (
    <div className="flex flex-col gap-6">
      {statusError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ef4444] bg-[#1a1a26] px-4 py-3 text-sm text-white"
        >
          <span aria-hidden="true">✕</span>
          <span>Connection error: {statusError}</span>
          <button
            type="button"
            onClick={() => status.mutate()}
            aria-label="Retry loading system status"
            className="ml-auto text-xs text-[#D4AF37] underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      <NerveCenterLinks />

      <ContextualHelpWidget />

      <LabInstallLinks />

      <SupportReliabilityPanel />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KnightsWatchingChip />
        <DeadLetterDrainChip />
        <NightCleanerChip data={status.data?.nightCleaner} />
        <HelpEvalChip data={status.data?.helpEval} />
        <CostAnomalyChip data={status.data?.costAnomaly} />
      </div>

      <MoleKnightsAuditPanel />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SystemStatusPanel status={status.data} />
        <ConfigDebtPanel
          data={status.data?.configDebt}
          onApplied={() => void status.mutate()}
        />
        <GitHubHealthPanel data={status.data?.github} />
        <RenderDeployPanel data={status.data?.render} />
        <NeonDBPanel data={status.data?.neon} />
        <StripeMRRPanel data={status.data?.stripe} />
        <ActiveUsersPanel data={status.data?.activeUsers} />
        <PilotStatusPanel data={status.data?.pilot} />
        <PilotConnectionPanel data={status.data?.pilotConnection} />
        <AuditTrailPanel entries={audit.data} error={auditError} />
      </div>
    </div>
  )
}
