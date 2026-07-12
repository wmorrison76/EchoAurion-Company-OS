import { db } from '@/lib/db'
import { canRequestBuild, normalizePilotRole } from '@/lib/work-roles'

export function signaturesMatch(typed: string, signerName: string): boolean {
  return typed.trim().toLowerCase() === signerName.trim().toLowerCase()
}

export async function requireWorkAgreement(workRequestId: string): Promise<
  | {
      ok: true
      agreement: {
        id: string
        signerName: string
        signerRole: string
        signerEmail: string | null
      }
    }
  | { ok: false; error: string; status: number; code?: string }
> {
  const agreement = await db.workAgreement.findUnique({ where: { workRequestId } })
  if (!agreement) {
    return {
      ok: false,
      error:
        'Work agreement required — authorize is blocked until an ADMIN/DIRECTOR/EXEC profile signs the quote',
      status: 403,
      code: 'AGREEMENT_REQUIRED',
    }
  }
  return {
    ok: true,
    agreement: {
      id: agreement.id,
      signerName: agreement.signerName,
      signerRole: agreement.signerRole,
      signerEmail: agreement.signerEmail,
    },
  }
}

export function validateAgreementInput(input: {
  role: string
  signerName: string
  typedSignature: string
  agreed: boolean
}): { ok: true; role: string } | { ok: false; error: string } {
  if (!input.agreed) {
    return { ok: false, error: 'You must accept the work agreement checkbox' }
  }
  if (!canRequestBuild(input.role)) {
    return {
      ok: false,
      error: 'Only ADMIN, DIRECTOR, or EXEC profiles may sign paid work agreements',
    }
  }
  if (!input.signerName.trim()) {
    return { ok: false, error: 'Signer name is required' }
  }
  if (!signaturesMatch(input.typedSignature, input.signerName)) {
    return {
      ok: false,
      error: 'Typed signature must match the profile name exactly',
    }
  }
  const role = normalizePilotRole(input.role)
  if (!role) return { ok: false, error: 'Invalid signer role' }
  return { ok: true, role }
}
