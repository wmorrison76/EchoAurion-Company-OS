/**
 * Shared Render cron helper: POST to a Company OS API path with CRON_SECRET.
 *
 * Usage: node scripts/cron-http-post.mjs /api/maintenance/dispatch
 *
 * Env (first match wins for base URL):
 *   WEB_SERVICE_URL | RENDER_EXTERNAL_URL | NEXTAUTH_URL
 * Required:
 *   CRON_SECRET
 *
 * Exit 0 on HTTP 2xx (including empty dispatch / sent:0).
 * Exit 1 on missing config, network error, or non-2xx.
 */

import { pathToFileURL } from 'node:url'

function resolveBaseUrl() {
  const raw =
    process.env.WEB_SERVICE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.NEXTAUTH_URL ||
    ''
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export async function cronHttpPost(apiPath) {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const base = resolveBaseUrl()
  const secret = process.env.CRON_SECRET

  if (!base) {
    console.error(
      '[cron] Missing base URL. Set WEB_SERVICE_URL (preferred), or RENDER_EXTERNAL_URL / NEXTAUTH_URL.'
    )
    process.exit(1)
  }
  if (!secret) {
    console.error('[cron] Missing CRON_SECRET. Set the same value on web and cron services.')
    process.exit(1)
  }

  const url = `${base}${path}`
  console.log(`[cron] POST ${url}`)

  let res
  try {
    // redirect: 'manual' — middleware login redirects must not look like success.
    res = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    console.error(`[cron] Network error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const bodyText = await res.text().catch(() => '')
  const snippet = bodyText.slice(0, 400)

  const redirected = res.status >= 300 && res.status < 400
  if (!res.ok || redirected) {
    console.error(`[cron] HTTP ${res.status} ${res.statusText}`)
    if (snippet) console.error(`[cron] Body: ${snippet}`)
    if (res.status === 401 || res.status === 403) {
      console.error('[cron] Auth failed — check CRON_SECRET matches the web service.')
    }
    if (res.status === 404) {
      console.error('[cron] Not found — check WEB_SERVICE_URL points at the Company OS web service.')
    }
    if (redirected) {
      console.error(
        '[cron] Redirect (likely middleware) — ensure the path is public for CRON_SECRET auth.'
      )
    }
    process.exit(1)
  }

  // Defense in depth: login HTML must never count as a successful dispatch.
  if (/^\s*<!DOCTYPE html/i.test(bodyText) || /<html[\s>]/i.test(bodyText)) {
    console.error('[cron] Got HTML instead of JSON — likely redirected to /login (middleware).')
    process.exit(1)
  }

  console.log(`[cron] OK HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}`)
  process.exit(0)
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const entryPath = process.argv[2]
  if (!entryPath) {
    console.error('Usage: node scripts/cron-http-post.mjs /api/...')
    process.exit(1)
  }
  cronHttpPost(entryPath)
}
