'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/** Must match MIN_PASSWORD_LENGTH in src/lib/admin-password.ts */
const MIN_PASSWORD_LENGTH = 12

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#ef4444] bg-[#1a1a26] px-4 py-3 text-sm text-white"
        >
          <span aria-label="Error">✕</span>
          <span>This reset link is missing or invalid.</span>
        </div>
        <p className="text-center text-sm text-[#a0a0b8]">
          <Link
            href="/login/forgot"
            className="text-[#D4AF37] underline-offset-2 hover:underline"
            aria-label="Request a new password reset link"
          >
            Request a new link
          </Link>
        </p>
      </div>
    )
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const password = data.get('password')
    const confirm = data.get('confirm')

    if (typeof password !== 'string' || typeof confirm !== 'string') {
      setStatus({ kind: 'error', message: 'Enter and confirm your new password' })
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus({
        kind: 'error',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      })
      return
    }
    if (password !== confirm) {
      setStatus({ kind: 'error', message: 'Passwords do not match' })
      return
    }

    setStatus({ kind: 'loading' })
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const body = (await res.json()) as {
        success: boolean
        data?: { message: string }
        error?: string
      }

      if (!res.ok || !body.success) {
        setStatus({
          kind: 'error',
          message: body.error ?? 'Unable to reset password',
        })
        return
      }

      setStatus({
        kind: 'success',
        message: body.data?.message ?? 'Password updated.',
      })
      window.setTimeout(() => router.push('/login'), 1500)
    } catch {
      setStatus({ kind: 'error', message: 'Connection error. Try again.' })
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-[#a0a0b8]">
        Choose a new password (minimum {MIN_PASSWORD_LENGTH} characters). After reset, sign in
        with this password — no Render env change needed.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-xs uppercase tracking-widest text-[#D4AF37]">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-label="New password"
          disabled={status.kind === 'loading' || status.kind === 'success'}
          className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-4 py-3 text-sm text-white outline-none transition-colors duration-150 focus:border-[#D4AF37] disabled:opacity-60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="confirm-password"
          className="text-xs uppercase tracking-widest text-[#D4AF37]"
        >
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-label="Confirm new password"
          disabled={status.kind === 'loading' || status.kind === 'success'}
          className="rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-4 py-3 text-sm text-white outline-none transition-colors duration-150 focus:border-[#D4AF37] disabled:opacity-60"
        />
      </div>

      {status.kind === 'error' ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-2 rounded-xl border border-[#ef4444] bg-[#1a1a26] px-4 py-3 text-sm text-white"
        >
          <span aria-label="Error">✕</span>
          <span>{status.message}</span>
        </div>
      ) : null}

      {status.kind === 'success' ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl border border-[#22c55e] bg-[#1a1a26] px-4 py-3 text-sm text-white"
        >
          <span aria-label="Success" className="mt-0.5">
            ✓
          </span>
          <span>{status.message}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status.kind === 'loading' || status.kind === 'success'}
        aria-label="Save new password"
        className="mt-2 w-full rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-3 text-sm font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'loading' ? 'Saving…' : 'Save new password'}
      </button>

      <p className="text-center text-sm text-[#a0a0b8]">
        <Link
          href="/login"
          className="text-[#D4AF37] underline-offset-2 transition-colors duration-150 hover:text-[#f0c840] hover:underline"
          aria-label="Back to sign in"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
