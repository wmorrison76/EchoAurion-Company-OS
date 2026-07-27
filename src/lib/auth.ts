import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authConfig } from './auth.config'
import { audit } from './audit'
import { resolveAdminPasswordHash } from './admin-password'
import { allowRateLimit, clientIp } from './rate-limit'

// Single-admin credentials login. Runs only in the Node runtime (never Edge)
// because bcrypt and the audit log require Node APIs. See CLAUDE.md §8.
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // Brute-force guard on the single high-value admin account: sliding
        // windows per IP+email and per IP. Successful logins spend budget too,
        // but a legitimate admin never signs in 10× in 15 minutes. In-memory
        // per instance (same residual as rate-limit.ts — Redis when we scale).
        const ip = request ? clientIp(request as unknown as Request) : 'unknown'
        const perIdentity = allowRateLimit(`login:${ip}:${email.toLowerCase()}`, 10, 15 * 60_000)
        const perIp = allowRateLimit(`login:ip:${ip}`, 20, 15 * 60_000)
        if (!perIdentity.ok || !perIp.ok) {
          await audit('william_morrison', 'auth.login.rate_limited', undefined, { ip }).catch(
            () => {}
          )
          return null
        }

        const adminEmail = process.env.ADMIN_EMAIL
        const adminHash = await resolveAdminPasswordHash()

        // Fail closed if the admin identity is not configured.
        if (!adminEmail || !adminHash) return null
        if (email.toLowerCase() !== adminEmail.toLowerCase()) return null

        const valid = await bcrypt.compare(password, adminHash)
        if (!valid) {
          await audit('william_morrison', 'auth.login.failed', undefined, { ip }).catch(() => {})
          return null
        }

        // Best-effort audit; never block login on a DB hiccup (CLAUDE.md §19).
        await audit('william_morrison', 'auth.session.create').catch(() => {})

        return {
          id: 'william_morrison',
          name: 'William Morrison',
          email: adminEmail,
          role: 'dr_os',
        }
      },
    }),
  ],
})
