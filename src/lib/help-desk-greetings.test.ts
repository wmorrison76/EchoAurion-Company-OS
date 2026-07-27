import { describe, expect, it } from 'vitest'
import { isSimpleGreeting } from './help-desk-greetings'

describe('isSimpleGreeting', () => {
  it('matches common presence pings', () => {
    expect(isSimpleGreeting('Hi')).toBe(true)
    expect(isSimpleGreeting('hi how are you doing')).toBe(true)
    expect(isSimpleGreeting('are you active?')).toBe(true)
    expect(isSimpleGreeting('Hello there!')).toBe(true)
  })

  it('rejects real support asks', () => {
    expect(isSimpleGreeting('conversational talk to talk not working')).toBe(false)
    expect(isSimpleGreeting('BEO print fails on ytd.gross')).toBe(false)
    expect(isSimpleGreeting('')).toBe(false)
  })
})
