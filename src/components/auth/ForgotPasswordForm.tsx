'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const email = new FormData(form).get('email')
    if (typeof email !== 'string' || !email.trim()) {
      setStatus({ kind: 'error', message: 'Enter your email address' })
      return
    }

    setStatus({ kind: 'loading' })
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await res.json()) as {
        success: boolean
        data?: { message: string }
        error?: string
        code?: string
      }

      if (!res.ok || !data.success) {
        const message =
          data.code === 'EMAIL_NOT_CONFIGURED' || data.error === 'Email is not configured'
            ? 'Email is not configured. On Render set RESEND_API_KEY and EMAIL_FROM (see DEPLOY.md), then try again.'
            : data.code === 'EMAIL_SEND_FAILED'
              ? data.error ??
                'Unable to send reset email. Check Resend dashboard and that ADMIN_EMAIL matches the Resend account inbox when using onboarding@resend.dev.'
              : (data.error ?? 'Unable to send reset email')
        setStatus({ kind: 'error', message })
        return
      }

      setStatus({
        kind: 'success',
        message:
          data.data?.message ??
          'If that email is registered, a reset link has been sent. Check your inbox.',
      })
      form.reset()
    } catch {
      setStatus({ kind: 'error', message: 'Connection error. Try again.' })
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-[#a0a0b8]">
        Enter the admin email. If it matches, we will send a one-hour reset link.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-xs uppercase tracking-widest text-[#D4AF37]">
          Email
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-label="Admin email address"
          disabled={status.kind === 'loading'}
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
        disabled={status.kind === 'loading'}
        aria-label="Send password reset link"
        className="mt-2 w-full rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-3 text-sm font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'loading' ? 'Sending…' : 'Send reset link'}
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
