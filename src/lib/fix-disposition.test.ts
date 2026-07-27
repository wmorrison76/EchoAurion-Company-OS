import { describe, expect, it } from 'vitest'
import {
  closeReasonForApprove,
  extractFixedInSha,
  fixDispositionBadge,
  looksLikeCodeChangePending,
} from './fix-disposition'

describe('fix-disposition', () => {
  it('extracts Fixed in SHA', () => {
    expect(extractFixedInSha('Fixed in abcdef1 on deploy branch')).toBe('abcdef1')
    expect(extractFixedInSha('sha: deadbeefcafe')).toBe('deadbeefcafe')
  })

  it('detects NEEDS_CODE_CHANGE pending', () => {
    expect(
      looksLikeCodeChangePending({
        messageBodies: ['Maestro: NEEDS_CODE_CHANGE', 'BUILD locked'],
      })
    ).toBe(true)
    expect(looksLikeCodeChangePending({ answer: 'Click Settings → Language' })).toBe(false)
  })

  it('approve stamps reply_sent_code_pending when code still needed', () => {
    expect(
      closeReasonForApprove({
        answer: 'We are drafting a fix',
        messageBodies: ['NEEDS_CODE_CHANGE — draft PR required'],
      })
    ).toBe('reply_sent_code_pending')
  })

  it('badge shows Chat replied · Code not deployed', () => {
    const b = fixDispositionBadge({
      status: 'RESOLVED',
      closeReason: 'reply_sent_code_pending',
    })
    expect(b?.label).toBe('▲ Chat replied · Code not deployed')
    expect(b?.level).toBe('warn')
  })

  it('badge shows Fixed in SHA', () => {
    const b = fixDispositionBadge({
      status: 'RESOLVED',
      closeReason: 'resolved_fix',
      answer: 'Fixed in 3f51a8f02 on laughing-noether',
    })
    expect(b?.label).toBe('✓ Fixed in 3f51a8f02')
    expect(b?.level).toBe('ok')
  })
})
