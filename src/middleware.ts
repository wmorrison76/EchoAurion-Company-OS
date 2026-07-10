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
  // health check, webhooks, relay/knowledge ingest, and static assets.
  matcher: [
    '/((?!login|api/auth|api/health|api/financial/webhook|api/financial/sync|api/support/diagnostics|api/relay|api/knowledge/ingest|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-|apple-touch-icon).*)',
  ],
}
