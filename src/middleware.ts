import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'

// Edge middleware uses the bcrypt-free config. We redirect unauthenticated
// requests to /login explicitly (CLAUDE.md §8.4 + §22.3).
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  // Public marketing homepage — allow through; page redirects authed users to /dr-os.
  if (req.nextUrl.pathname === '/') {
    return NextResponse.next()
  }

  if (!req.auth?.user) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
})

export const config = {
  // Protect everything except the public homepage, login, auth endpoints,
  // health check, webhooks, cron routes (CRON_SECRET), relay/knowledge ingest,
  // and static assets.
  matcher: [
    '/((?!login|api/auth|api/health|api/financial/webhook|api/financial/sync|api/maintenance/dispatch|api/board-room/briefing|api/support/diagnostics|api/relay|api/knowledge/ingest|api/knowledge/retrieve|api/knowledge/book-ingest|api/webhooks/github|api/webhooks/support-ivr|api/webhooks/support-email|api/help-center|help-center|api/ops/poll-failures|api/ops/drain-queue|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-|apple-touch-icon|help-desk-icon).*)',
  ],
}
