import { describe, expect, it } from 'vitest'
import { parseRelayUserId, userIdContextEquals } from './relay-question-scope'

describe('relay-question-scope', () => {
  it('accepts safe userIds and rejects junk', () => {
    expect(parseRelayUserId('user_abc-123')).toBe('user_abc-123')
    expect(parseRelayUserId('a.b:c_1')).toBe('a.b:c_1')
    expect(parseRelayUserId('')).toBeNull()
    expect(parseRelayUserId('  ')).toBeNull()
    expect(parseRelayUserId('bad user')).toBeNull()
    expect(parseRelayUserId('x'.repeat(129))).toBeNull()
  })

  it('builds JSON path filter for context.userId', () => {
    expect(userIdContextEquals('u1')).toEqual({
      path: ['userId'],
      equals: 'u1',
    })
  })
})
