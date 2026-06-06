'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'

export type LoginState = { error: string | null }

/**
 * Authenticates the single admin user. On success NextAuth throws a redirect
 * (to /dr-os) which Next.js must propagate — so we only catch AuthError.
 * The returned message is intentionally generic: it never reveals which field
 * was wrong (CLAUDE.md §15 Step 1 acceptance + §23).
 */
export async function authenticate(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dr-os',
    })
    return { error: null }
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Invalid credentials' }
    }
    // Re-throw redirect signals and unexpected errors.
    throw error
  }
}
