import { describe, expect, it } from 'vitest'
import {
  customerAnswerNeedsSanitize,
  sanitizeCustomerFacingAnswer,
} from '@/lib/help-desk-customer-copy'

describe('sanitizeCustomerFacingAnswer', () => {
  it('strips Draft reply for William to review prefix and --- separator', () => {
    const raw =
      'Draft reply for William to review: --- Thanks for flagging the Mixology panel styling.'
    expect(sanitizeCustomerFacingAnswer(raw)).toBe(
      'Thanks for flagging the Mixology panel styling.'
    )
  })

  it('strips variant draft prefixes', () => {
    expect(sanitizeCustomerFacingAnswer('Draft answer for review: Hello team.')).toBe(
      'Hello team.'
    )
    expect(sanitizeCustomerFacingAnswer('Draft reply for William: --- Hi there.')).toBe(
      'Hi there.'
    )
  })

  it('strips trailing [operator note] brackets', () => {
    const raw =
      'Gracias por avisarnos — revisaremos el panel.\n[English: Chronos UI mismatch on Mixology.]'
    expect(sanitizeCustomerFacingAnswer(raw)).toBe(
      'Gracias por avisarnos — revisaremos el panel.'
    )
  })

  it('preserves clean customer copy', () => {
    const clean = 'Thanks for flagging this — our team is reviewing the Chronos styling.'
    expect(sanitizeCustomerFacingAnswer(clean)).toBe(clean)
    expect(customerAnswerNeedsSanitize(clean)).toBe(false)
  })

  it('detects when sanitization is needed', () => {
    expect(
      customerAnswerNeedsSanitize('Draft reply for William to review: Thanks.')
    ).toBe(true)
  })
})
