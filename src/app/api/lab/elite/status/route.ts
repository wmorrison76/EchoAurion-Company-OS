import { auth } from '@/lib/auth'
import { constitutionSummary } from '@/lib/constitution'
import { getAutonomyConfig } from '@/lib/autonomy'
import { buildSpendCapUsd } from '@/lib/spend-cap'
import { latestEvalRun, ensureEvalCasesSeeded } from '@/lib/help-eval'
import { resolveAdminEmailForDocs, superAdminDisplayRole } from '@/lib/admin-profile'
import { isEmailConfigured } from '@/lib/email'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

export interface EliteReadinessPayload {
  adminEmail: string
  roles: { os: string; paid: string }
  constitutionVersion: string
  autonomy: Awaited<ReturnType<typeof getAutonomyConfig>>
  emailConfigured: boolean
  healthOk: boolean
  spendCapUsd: number
  lastEvalScore: number | null
  lastEvalAt: string | null
  rules: ReturnType<typeof constitutionSummary>['rules']
}

/** GET /api/lab/elite/status — readiness snapshot for /lab/elite. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    let healthOk = false
    try {
      await db.$queryRaw`SELECT 1`
      healthOk = true
    } catch {
      healthOk = false
    }

    await ensureEvalCasesSeeded().catch(() => 0)
    const evalRun = await latestEvalRun().catch(() => null)
    const autonomy = await getAutonomyConfig()
    const constitution = constitutionSummary()

    const data: EliteReadinessPayload = {
      adminEmail: resolveAdminEmailForDocs(),
      roles: superAdminDisplayRole(),
      constitutionVersion: constitution.version,
      autonomy,
      emailConfigured: isEmailConfigured(),
      healthOk,
      spendCapUsd: buildSpendCapUsd(),
      lastEvalScore: evalRun?.score ?? null,
      lastEvalAt: evalRun?.createdAt ?? null,
      rules: constitution.rules,
    }
    return Response.json({ success: true, data } satisfies APIResponse<EliteReadinessPayload>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Elite status failed',
      },
      { status: 500 }
    )
  }
}
