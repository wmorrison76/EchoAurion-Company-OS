import { describe, expect, it } from 'vitest'
import {
  compareHelpDeskQueue,
  formatEchoContextSystemBody,
  isEchoAiContext,
  isEchoAiTicket,
  looksLikeCodeDeployFix,
  priorityRank,
} from './echo-ticket-priority'

describe('echo-ticket-priority', () => {
  it('detects echo_ai context flags', () => {
    expect(isEchoAiContext({ source: 'echo_ai', echoPriority: true })).toBe(true)
    expect(isEchoAiContext({ intakeChannel: 'ECHO' })).toBe(true)
    expect(isEchoAiContext({ moduleHint: 'echo_ai' })).toBe(true)
    expect(isEchoAiContext({ source: 'pilot' })).toBe(false)
    expect(isEchoAiContext(null)).toBe(false)
  })

  it('sorts Echo / URGENT above normal TEXT', () => {
    const echo = {
      echoAi: true,
      intakeChannel: 'ECHO',
      priority: 'URGENT',
      updatedAt: '2026-07-19T01:00:00.000Z',
    }
    const normal = {
      echoAi: false,
      intakeChannel: 'IN_APP',
      priority: 'NORMAL',
      updatedAt: '2026-07-19T12:00:00.000Z',
    }
    expect(compareHelpDeskQueue(echo, normal)).toBeLessThan(0)
    expect(compareHelpDeskQueue(normal, echo)).toBeGreaterThan(0)
    expect(priorityRank('URGENT')).toBeLessThan(priorityRank('NORMAL'))
  })

  it('isEchoAiTicket reads intakeChannel ECHO', () => {
    expect(isEchoAiTicket({ intakeChannel: 'ECHO' })).toBe(true)
    expect(isEchoAiTicket({ intakeChannel: 'IN_APP', moduleHint: 'ci' })).toBe(false)
  })

  it('formats SYSTEM body with goals and errors', () => {
    const body = formatEchoContextSystemBody({
      userGoals: 'Fill Coq au Vin recipe',
      failedStep: 'fill_empty_recipes',
      lastError: 'timeout',
      echoTaskId: 'req_1',
      systemCheck: {
        cannot: [{ label: 'Inventory module' }],
        speakable: ['I cannot use inventory right now.'],
      },
    })
    expect(body).toContain('◆ Echo AI')
    expect(body).toContain('Coq au Vin')
    expect(body).toContain('fill_empty_recipes')
    expect(body).toContain('Inventory module')
  })

  it('detects code deploy language on Echo tickets', () => {
    expect(
      looksLikeCodeDeployFix({
        echoAi: true,
        answer: 'Fix is live on Render — soft reload when ready.',
      })
    ).toBe(true)
    expect(
      looksLikeCodeDeployFix({
        echoAi: true,
        answer: 'Try the recipe fill again — inventory path was slow.',
      })
    ).toBe(false)
  })
})
