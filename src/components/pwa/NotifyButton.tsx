'use client'

import { useEffect, useState } from 'react'
import type { APIResponse } from '@/types'

type State = 'idle' | 'unsupported' | 'disabled' | 'ready' | 'enabled' | 'working'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * "Enable alerts on this device" — requests notification permission and
 * registers a web-push subscription. Degrades clearly when push isn't
 * configured server-side or the browser can't support it.
 */
export function NotifyButton() {
  const [state, setState] = useState<State>('idle')
  const [publicKey, setPublicKey] = useState<string | null>(null)

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    if (!supported) {
      setState('unsupported')
      return
    }
    fetch('/api/push/subscribe')
      .then((r) => r.json() as Promise<APIResponse<{ configured: boolean; publicKey: string | null }>>)
      .then((b) => {
        if (!b.success || !b.data.configured || !b.data.publicKey) {
          setState('disabled')
          return
        }
        setPublicKey(b.data.publicKey)
        setState(Notification.permission === 'granted' ? 'enabled' : 'ready')
      })
      .catch(() => setState('disabled'))
  }, [])

  async function enable() {
    if (!publicKey) return
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('ready')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      setState('enabled')
    } catch {
      setState('ready')
    }
  }

  const label: Record<State, string> = {
    idle: 'Checking…',
    unsupported: 'Alerts not supported on this browser',
    disabled: 'Phone alerts not configured (set VAPID keys)',
    ready: '🔔 Enable alerts on this device',
    enabled: '✓ Alerts enabled — questions & work ping here',
    working: 'Enabling…',
  }

  const interactive = state === 'ready' || state === 'working'
  const hint =
    state === 'disabled'
      ? 'Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY on Render, then refresh.'
      : state === 'enabled'
        ? 'New customer questions and work requests raise an alert + push when VAPID is live.'
        : state === 'ready'
          ? 'Tap to allow notifications — fires on new questions / work requests.'
          : null

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={state === 'ready' ? enable : undefined}
        disabled={!interactive}
        aria-label={label[state]}
        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:opacity-70 ${
          state === 'enabled'
            ? 'border-[#22c55e]/50 bg-[#12121a] text-[#22c55e]'
            : state === 'ready'
              ? 'border-[#D4AF37] bg-[#12121a] text-[#D4AF37] hover:bg-[#1a1a26]'
              : 'border-[#2a2a3f] bg-[#12121a] text-[#a0a0b8]'
        }`}
      >
        {label[state]}
      </button>
      {hint ? <p className="max-w-[220px] text-[10px] leading-snug text-[#5a5a78]">{hint}</p> : null}
    </div>
  )
}
