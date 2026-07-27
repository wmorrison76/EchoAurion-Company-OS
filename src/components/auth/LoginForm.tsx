'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import { authenticate, type LoginState } from '@/app/login/actions'

const initialState: LoginState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Sign in to EchoAurion Company OS"
      className="mt-2 w-full rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-3 text-sm font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign In'}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useFormState(authenticate, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs uppercase tracking-widest text-[#D4AF37]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-label="Email address"
          className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-4 py-3 text-sm text-white outline-none transition-colors duration-150 focus:border-[#D4AF37]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="text-xs uppercase tracking-widest text-[#D4AF37]">
            Password
          </label>
          <Link
            href="/login/forgot"
            className="text-xs text-[#a0a0b8] underline-offset-2 transition-colors duration-150 hover:text-[#D4AF37] hover:underline"
            aria-label="Forgot password"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-label="Password"
          className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-4 py-3 text-sm text-white outline-none transition-colors duration-150 focus:border-[#D4AF37]"
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-2 rounded-xl border border-[#ef4444] bg-[#1a1a26] px-4 py-3 text-sm text-[#ffffff]"
        >
          <span aria-hidden="true">✕</span>
          <span>{state.error}</span>
        </div>
      ) : null}

      <SubmitButton />
    </form>
  )
}
