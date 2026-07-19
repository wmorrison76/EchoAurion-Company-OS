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

  it('formats SYSTEM body with goals, panel slow context, and errors', () => {
    const body = formatEchoContextSystemBody({
      userGoals: 'open Culinary',
      action: 'open_panel',
      panelId: 'culinary',
      elapsedMs: 8200,
      loadThreshold: 'hard',
      silent: true,
      failedStep: 'open_panel',
      lastError: 'panel_not_ready after 8200ms (hard)',
      echoTaskId: 'req_1',
      systemCheck: {
        cannot: [{ label: 'Inventory module' }],
        speakable: ['I cannot use inventory right now.'],
      },
    })
    expect(body).toContain('◆ Echo AI')
    expect(body).toContain('silent night-shift')
    expect(body).toContain('culinary')
    expect(body).toContain('8200')
    expect(body).toContain('Silent: user UI not notified')
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
