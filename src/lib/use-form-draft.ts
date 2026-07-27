'use client'

import { useEffect, useRef } from 'react'

/**
 * Zero-work-loss form drafts (docs/UPDATE_WITHOUT_LOSING_WORK.md).
 *
 * Debounce-persists a form value to localStorage and restores it on mount, so
 * a dropped connection, Render redeploy, soft_reload, tab crash, or expired
 * session never loses in-progress typing. Storage is per-browser and keyed by
 * caller (include the entity id, e.g. `hd-reply:${ticketId}`).
 *
 * Usage:
 *   useFormDraft(`hd-reply:${id}`, reply, setReply)
 *   ...on successful submit: clearFormDraft(`hd-reply:${id}`)
 */

const PREFIX = 'ea-draft:'
const DEBOUNCE_MS = 600
const MAX_AGE_MS = 7 * 86_400_000 // drafts older than a week are stale

type Stored = { v: string; t: number }

function read(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (!parsed?.v || Date.now() - (parsed.t ?? 0) > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key)
      return null
    }
    return parsed.v
  } catch {
    return null
  }
}

export function clearFormDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // storage unavailable (private mode) — nothing to clear
  }
}

export function useFormDraft(
  key: string,
  value: string,
  restore: (draft: string) => void
): void {
  const restoredFor = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore once per key — only into an empty field, never over user typing.
  useEffect(() => {
    if (restoredFor.current === key) return
    restoredFor.current = key
    const draft = read(key)
    if (draft && !value.trim()) restore(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Debounced save; empty value clears the draft.
  useEffect(() => {
    if (restoredFor.current !== key) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        if (value.trim()) {
          window.localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, t: Date.now() }))
        } else {
          window.localStorage.removeItem(PREFIX + key)
        }
      } catch {
        // storage full/unavailable — draft protection degrades silently
      }
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [key, value])
}

/** Warn before closing/navigating away while a form holds unsaved work. */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
