'use client'

import { useState } from 'react'
import { clearFormDraft, useFormDraft, useUnsavedChangesGuard } from '@/lib/use-form-draft'
import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/types/crm'
import type { APIResponse } from '@/types'
import type { DealDTO, DealStage } from '@/types/crm'

interface DealFormProps {
  deal: DealDTO
  onSaved: () => void
}

const inputCls =
  'w-full rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]'

export function DealForm({ deal, onSaved }: DealFormProps) {
  const [stage, setStage] = useState<DealStage>(deal.stage)
  const [value, setValue] = useState(deal.value !== null ? String(deal.value) : '')
  const [notes, setNotes] = useState(deal.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Zero-work-loss: keep unsent notes across disconnects and warn on close
  // while any field differs from the server state.
  useFormDraft(`crm-deal-notes:${deal.id}`, notes, setNotes)
  useUnsavedChangesGuard(
    notes !== (deal.notes ?? '') ||
      stage !== deal.stage ||
      value !== (deal.value !== null ? String(deal.value) : '')
  )

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          value: value.trim() === '' ? null : Number(value),
          notes,
        }),
      })
      const body = (await res.json()) as APIResponse<unknown>
      if (!body.success) throw new Error(body.error)
      clearFormDraft(`crm-deal-notes:${deal.id}`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-white">{deal.title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
          Stage
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as DealStage)}
            className={inputCls}
            aria-label="Deal stage"
          >
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {DEAL_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
          Value (USD)
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputCls}
            aria-label="Deal value in USD"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-[#a0a0b8]">
        Notes
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputCls} resize-y`}
          aria-label="Deal notes"
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-white">
          <span aria-hidden="true">✕</span> {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="self-start rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0a0a0f] transition-colors duration-150 hover:bg-[#f0c840] disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save deal'}
      </button>
    </div>
  )
}
