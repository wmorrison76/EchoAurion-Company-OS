/**
 * Safe toolbelt — allowlisted pilot directives.
 * Dry-run by default. Execute publishes relay outbox events only (never SSH/RDP).
 * See docs/ELITE_DR_OS.md
 */

import type { Prisma } from '@prisma/client'
import { SAFE_TOOLS, type SafeTool, type ToolInvokeResult } from '@/lib/safe-tools-types'
import { audit } from '@/lib/audit'
import { checkConstitution, checkNoPii } from '@/lib/constitution'
import { getAutonomyConfig, autonomyAllowsToolExecute } from '@/lib/autonomy'
import {
  publishNavigate,
  publishOpenPanel,
  publishRelayEvent,
  publishShowMessage,
} from '@/lib/relay-outbox'
import { createDraftPrPlan, maybeCreateGithubDraftPr } from '@/lib/pr-from-build'
import { db } from '@/lib/db'

export { SAFE_TOOLS, type SafeTool, type ToolInvokeResult } from '@/lib/safe-tools-types'

export interface ToolInvokeInput {
  tool: SafeTool
  clientKey: string
  params?: Record<string, unknown>
  dryRun?: boolean
  workRequestId?: string
  ticketId?: string
  actor?: 'william_morrison' | 'computer_agent'
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export async function invokeSafeTool(input: ToolInvokeInput): Promise<ToolInvokeResult> {
  if (!SAFE_TOOLS.includes(input.tool)) {
    throw new Error(`Tool not allowlisted: ${input.tool}`)
  }
  const pii = checkNoPii(input.params ?? {})
  if (!pii.ok) throw new Error(pii.reason)

  const autonomy = await getAutonomyConfig()
  const dryRun = input.dryRun !== false // default true
  const actor = input.actor ?? 'william_morrison'

  const constitution = checkConstitution('invoke_tool', {
    autonomyDial: autonomy.dial,
    dryRun,
  })
  if (!constitution.ok) {
    throw new Error(constitution.reason)
  }
  if (!dryRun && !autonomyAllowsToolExecute(autonomy.dial, dryRun)) {
    throw new Error(
      `Autonomy dial "${autonomy.dial}" does not permit tool execute — use dryRun:true or raise dial`
    )
  }

  // Hard blocks
  if (input.tool === 'open_pr') {
    const mergeCheck = checkConstitution('merge_pr')
    if (!mergeCheck.ok && input.params?.merge === true) {
      throw new Error(mergeCheck.reason)
    }
  }

  const base: ToolInvokeResult = {
    tool: input.tool,
    dryRun,
    executed: false,
    autonomyDial: autonomy.dial,
    message: '',
  }

  if (dryRun) {
    const preview = await previewTool(input)
    await audit(actor, 'tools.invoke.dry_run', input.ticketId ?? input.workRequestId, {
      tool: input.tool,
      clientKey: input.clientKey,
      params: input.params ?? {},
      preview,
    } as unknown as Prisma.InputJsonValue)
    return {
      ...base,
      message: `Dry-run OK: ${preview.summary}`,
      detail: preview,
    }
  }

  const executed = await executeTool(input)
  await audit(actor, 'tools.invoke.execute', input.ticketId ?? input.workRequestId, {
    tool: input.tool,
    clientKey: input.clientKey,
    params: input.params ?? {},
    result: executed,
  } as unknown as Prisma.InputJsonValue)
  return {
    ...base,
    dryRun: false,
    executed: true,
    message: executed.summary,
    outboxEventId: executed.outboxEventId,
    detail: executed,
  }
}

async function previewTool(input: ToolInvokeInput): Promise<{
  summary: string
  wouldPublish: string
  params: Record<string, unknown>
}> {
  const params = input.params ?? {}
  switch (input.tool) {
    case 'open_panel':
      return {
        summary: `Would open panel "${asString(params.panelId, 'unknown')}" on ${input.clientKey}`,
        wouldPublish: 'open_panel + directive',
        params,
      }
    case 'show_message':
      return {
        summary: `Would show message "${asString(params.title, 'Notice')}" on ${input.clientKey}`,
        wouldPublish: 'show_message + directive',
        params,
      }
    case 'navigate':
      return {
        summary: `Would navigate pilot to "${asString(params.path, '/')}"`,
        wouldPublish: 'navigate + directive',
        params,
      }
    case 'restart_worker':
      return {
        summary: `Would record restart_worker intent for ${input.clientKey} (NO SSH)`,
        wouldPublish: 'directive:restart_worker',
        params,
      }
    case 'clear_cache':
      return {
        summary: `Would record clear_cache directive for ${input.clientKey}`,
        wouldPublish: 'directive:clear_cache',
        params,
      }
    case 'toggle_feature_flag':
      return {
        summary: `Would toggle flag "${asString(params.flagKey, '?')}" → ${String(params.enabled ?? true)}`,
        wouldPublish: 'directive:toggle_feature_flag',
        params,
      }
    case 'open_pr':
      return {
        summary: 'Would build PR plan (draft only) and optionally open GitHub draft PR',
        wouldPublish: 'work.draftPlan + optional draft PR',
        params,
      }
    case 'rollback_hint':
      return {
        summary: `Would attach rollback hint "${asString(params.rollbackRef, '(missing)')}"`,
        wouldPublish: 'work_status + note',
        params,
      }
    default:
      return { summary: 'Unknown', wouldPublish: 'none', params }
  }
}

async function executeTool(input: ToolInvokeInput): Promise<{
  summary: string
  outboxEventId?: string
  [k: string]: unknown
}> {
  const params = input.params ?? {}
  const ticketId = input.ticketId

  switch (input.tool) {
    case 'open_panel': {
      const panelId = asString(params.panelId)
      if (!panelId) throw new Error('params.panelId required')
      await publishOpenPanel({
        clientKey: input.clientKey,
        panelId,
        params: (params.panelParams as Record<string, unknown>) ?? undefined,
        ticketId,
      })
      return { summary: `Opened panel ${panelId}`, panelId }
    }
    case 'show_message': {
      const title = asString(params.title, 'Help Desk')
      const body = asString(params.body, '')
      if (!body) throw new Error('params.body required')
      await publishShowMessage({
        clientKey: input.clientKey,
        title,
        body,
        severity: (params.severity as 'info' | 'success' | 'warning' | 'error') ?? 'info',
        ticketId,
      })
      return { summary: `Showed message: ${title}` }
    }
    case 'navigate': {
      const path = asString(params.path)
      if (!path.startsWith('/')) throw new Error('params.path must start with /')
      await publishNavigate({ clientKey: input.clientKey, path, ticketId })
      return { summary: `Navigate → ${path}` }
    }
    case 'restart_worker': {
      const ev = await publishRelayEvent(input.clientKey, 'directive', {
        type: 'restart_worker',
        intentOnly: true,
        note: 'Stub — pilot should restart its own worker. Company OS does NOT SSH.',
        ticketId: ticketId ?? null,
      })
      return {
        summary: 'Recorded restart_worker intent (no SSH)',
        outboxEventId: ev.id,
      }
    }
    case 'clear_cache': {
      const ev = await publishRelayEvent(input.clientKey, 'directive', {
        type: 'clear_cache',
        scope: asString(params.scope, 'app'),
        ticketId: ticketId ?? null,
      })
      return { summary: 'Recorded clear_cache directive', outboxEventId: ev.id }
    }
    case 'toggle_feature_flag': {
      const flagKey = asString(params.flagKey)
      if (!flagKey) throw new Error('params.flagKey required')
      const ev = await publishRelayEvent(input.clientKey, 'directive', {
        type: 'toggle_feature_flag',
        flagKey,
        enabled: params.enabled !== false,
        ticketId: ticketId ?? null,
      })
      return {
        summary: `Recorded flag toggle ${flagKey}`,
        outboxEventId: ev.id,
        flagKey,
      }
    }
    case 'open_pr': {
      const workId = input.workRequestId ?? asString(params.workRequestId)
      if (!workId) throw new Error('workRequestId required for open_pr')
      const plan = await createDraftPrPlan(workId)
      const gh = await maybeCreateGithubDraftPr(workId, plan)
      return {
        summary: gh.created
          ? `Draft PR plan stored; GitHub draft PR #${gh.number}`
          : `Draft PR plan stored (${gh.detail})`,
        plan,
        github: gh,
      }
    }
    case 'rollback_hint': {
      const rollbackRef = asString(params.rollbackRef)
      if (!rollbackRef) throw new Error('params.rollbackRef required')
      const workId = input.workRequestId ?? asString(params.workRequestId)
      if (workId) {
        await db.workRequest.update({
          where: { id: workId },
          data: { rollbackRef },
        })
      }
      const ev = await publishRelayEvent(input.clientKey, 'work_status', {
        type: 'rollback_hint',
        workId: workId || null,
        rollbackRef,
        note: asString(params.note, 'Rollback path recorded'),
      })
      return {
        summary: `Rollback hint recorded: ${rollbackRef}`,
        outboxEventId: ev.id,
        rollbackRef,
      }
    }
    default:
      throw new Error('Unhandled tool')
  }
}
