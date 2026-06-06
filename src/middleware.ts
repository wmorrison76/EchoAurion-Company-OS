import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'

// Edge middleware uses the bcrypt-free config. We redirect unauthenticated
// requests to /login explicitly (CLAUDE.md §8.4 + §22.3).
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  if (!req.auth?.user) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
})

export const config = {
  // Protect everything except the login page, auth endpoints, the public
  // health check, the Plaid webhook, and static assets.
  matcher: [
    '/((?!login|api/auth|api/health|api/financial/webhook|api/financial/sync|_next/static|_next/image|favicon.ico).*)',
  ],
}
