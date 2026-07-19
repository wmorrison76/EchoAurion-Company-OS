import { describe, expect, it, beforeEach } from 'vitest'
import {
  __resetEchoGuardrailsForTests,
  allowEchoTicketBudget,
  echoFileWhy,
  enforceEchoClientKey,
  isEchoPanelWatchEnabled,
  panelP95RegressionSignals,
  recordAnonymizedPanelOpen,
} from './echo-guardrails'

describe('echo-guardrails', () => {
  beforeEach(() => {
    __resetEchoGuardrailsForTests()
    delete process.env.ECHO_PANEL_WATCH
    delete process.env.ECHO_TICKETS_PER_CLIENT_PER_HOUR
  })

  it('kill switch ECHO_PANEL_WATCH=off', () => {
    expect(isEchoPanelWatchEnabled()).toBe(true)
    process.env.ECHO_PANEL_WATCH = 'off'
    expect(isEchoPanelWatchEnabled()).toBe(false)
  })

  it('hard-rejects placeholder clientKeys for Echo', () => {
    const bad = enforceEchoClientKey({
      clientKey: 'manual',
      context: { source: 'echo_ai' },
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe('CLIENT_KEY_ISOLATION')

    const good = enforceEchoClientKey({
      clientKey: 'miccosukee-pilot',
      context: { source: 'echo_ai' },
    })
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.echoAi).toBe(true)
  })

  it('budgets Echo tickets per clientKey per hour', () => {
    process.env.ECHO_TICKETS_PER_CLIENT_PER_HOUR = '2'
    expect(allowEchoTicketBudget('prop-a').ok).toBe(true)
    expect(allowEchoTicketBudget('prop-a').ok).toBe(true)
    const third = allowEchoTicketBudget('prop-a')
    expect(third.ok).toBe(false)
    // Other property still allowed
    expect(allowEchoTicketBudget('prop-b').ok).toBe(true)
  })

  it('builds consent why without PII', () => {
    const w = echoFileWhy({
      source: 'echo_ai',
      failureKind: 'panel_slow_load',
      panelId: 'culinary',
      elapsedMs: 1800,
      loadThreshold: 'soft',
      silent: true,
      userGoals: 'should not appear in why string if we keep why structured',
    })
    expect(w.why).toContain('kind=panel_slow_load')
    expect(w.why).toContain('panel=culinary')
    expect(w.why).not.toContain('should not appear')
  })

  it('records anonymized p95 and surfaces regression', () => {
    for (let i = 0; i < 6; i++) {
      recordAnonymizedPanelOpen({
        panelId: 'culinary',
        elapsedMs: 20_000,
        clientKey: 'prop-a',
      })
    }
    const signals = panelP95RegressionSignals()
    expect(signals.some((s) => s.panelId === 'culinary')).toBe(true)
  })
})
