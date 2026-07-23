import { createHash, createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'crypto'
import { getPlaidClient, plaidConfigured } from './plaid'

/**
 * Plaid webhook verification (Plaid-Verification header).
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 *
 * The header is an ES256 JWT whose payload carries `request_body_sha256` and
 * `iat`. The signing key is fetched from Plaid by `kid` and cached. We verify:
 *   1. JWT signature (ES256, key from /webhook_verification_key/get)
 *   2. iat within 5 minutes (replay guard)
 *   3. sha256(raw body) equals request_body_sha256
 *
 * Fail-closed when Plaid credentials are configured; when Plaid is not
 * configured at all the route keeps its historical audit-only behavior.
 */

const MAX_AGE_MS = 5 * 60_000
const keyCache = new Map<string, JsonWebKey>()

function b64urlToBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

async function getVerificationKey(kid: string): Promise<JsonWebKey | null> {
  const cached = keyCache.get(kid)
  if (cached) return cached
  const plaid = getPlaidClient()
  if (!plaid) return null
  try {
    const res = await plaid.webhookVerificationKeyGet({ key_id: kid })
    const key = res.data.key as unknown as JsonWebKey
    if (key) keyCache.set(kid, key)
    return key ?? null
  } catch {
    return null
  }
}

export type PlaidVerifyResult =
  | { ok: true }
  | { ok: false; reason: string }
  | { ok: 'unconfigured' }

export async function verifyPlaidWebhook(req: Request, rawBody: string): Promise<PlaidVerifyResult> {
  if (!plaidConfigured()) return { ok: 'unconfigured' }

  const jwt = req.headers.get('plaid-verification')
  if (!jwt) return { ok: false, reason: 'missing Plaid-Verification header' }

  const parts = jwt.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed JWT' }
  const [headerB64, payloadB64, sigB64] = parts

  let header: { alg?: string; kid?: string }
  let payload: { iat?: number; request_body_sha256?: string }
  try {
    header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8'))
    payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, reason: 'undecodable JWT' }
  }

  if (header.alg !== 'ES256' || !header.kid) {
    return { ok: false, reason: `unexpected alg/kid (${header.alg})` }
  }

  const jwk = await getVerificationKey(header.kid)
  if (!jwk) return { ok: false, reason: 'verification key unavailable' }

  let signatureValid = false
  try {
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
    signatureValid = cryptoVerify(
      'sha256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      b64urlToBuffer(sigB64)
    )
  } catch {
    return { ok: false, reason: 'signature verification error' }
  }
  if (!signatureValid) return { ok: false, reason: 'invalid signature' }

  const iatMs = (payload.iat ?? 0) * 1000
  if (!iatMs || Math.abs(Date.now() - iatMs) > MAX_AGE_MS) {
    return { ok: false, reason: 'stale or missing iat' }
  }

  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  if (bodyHash !== payload.request_body_sha256) {
    return { ok: false, reason: 'body hash mismatch' }
  }

  return { ok: true }
}
