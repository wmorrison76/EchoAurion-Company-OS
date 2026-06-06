import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authConfig } from './auth.config'
import { audit } from './audit'

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
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const adminEmail = process.env.ADMIN_EMAIL
        const adminHash = process.env.ADMIN_PASSWORD_HASH

        // Fail closed if the admin identity is not configured.
        if (!adminEmail || !adminHash) return null
        if (email.toLowerCase() !== adminEmail.toLowerCase()) return null

        const valid = await bcrypt.compare(password, adminHash)
        if (!valid) return null

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
