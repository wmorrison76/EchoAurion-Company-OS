'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link'
import type { APIResponse } from '@/types'

interface PlaidLinkButtonProps {
  onConnected: () => void
}

// Plaid Link must run in a client component (CLAUDE.md §22.1). Flow: request a
// link token → open Link → exchange the public token server-side → refresh.
export function PlaidLinkButton({ onConnected }: PlaidLinkButtonProps) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      try {
        const res = await fetch('/api/financial/plaid-link/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicToken }),
        })
        const body = (await res.json()) as APIResponse<unknown>
        if (!body.success) throw new Error(body.error)
        onConnected()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not link account')
      } finally {
        setToken(null)
      }
    },
    [onConnected]
  )

  const { open, ready } = usePlaidLink({ token: token ?? '', onSuccess })

  useEffect(() => {
    if (token && ready) open()
  }, [token, ready, open])

  const handleClick = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/financial/plaid-link/create-link-token', { method: 'POST' })
      const body = (await res.json()) as APIResponse<{ linkToken: string }>
      if (!body.success) throw new Error(body.error)
      setToken(body.data.linkToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Plaid Link')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label="Connect a bank account with Plaid"
        className="rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:opacity-60"
      >
        {loading ? 'Starting…' : 'Connect Account'}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-white">
          <span aria-hidden="true">✕</span> {error}
        </p>
      ) : null}
    </div>
  )
}
