import type { NextAuthConfig } from 'next-auth'

// Edge-safe NextAuth configuration. This file is imported by `middleware.ts`
// (Edge runtime) and MUST NOT import Node-only modules such as `bcryptjs` or
// the Prisma client. The Credentials provider (which uses bcrypt) is added in
// `auth.ts`, which only runs in the Node runtime. See CLAUDE.md §8 + §22.3.
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h, sliding via JWT
  trustHost: true, // required behind Render/CloudFront proxies
  providers: [], // populated in auth.ts (Node runtime)
  callbacks: {
    // Drives route protection from `middleware.ts`. The middleware matcher
    // already excludes /login, /api/auth and static assets, so any request
    // reaching here must carry a valid session.
    authorized({ auth }) {
      return Boolean(auth?.user)
    },
    jwt({ token, user }) {
      if (user) token.role = user.role
      return token
    },
    session({ session, token }) {
      if (typeof token.role === 'string') session.user.role = token.role
      return session
    },
  },
} satisfies NextAuthConfig
