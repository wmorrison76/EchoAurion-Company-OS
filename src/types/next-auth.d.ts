import type { DefaultSession } from 'next-auth'

// Module augmentation lets us carry the Dr. OS `role` on the session/JWT
// without resorting to `any` casts (CLAUDE.md §3, rule 5).
declare module 'next-auth' {
  interface Session {
    user: {
      role: string
    } & DefaultSession['user']
  }

  interface User {
    role: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string
  }
}
