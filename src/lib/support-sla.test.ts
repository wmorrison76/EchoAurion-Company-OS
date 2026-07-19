import { describe, expect, it } from 'vitest'
import { evaluateSla, isSlaBreached, isSlaPausedForOperatorQueue } from './support-sla'

describe('SLA pause while AWAITING_APPROVAL', () => {
  const createdAt = new Date('2026-07-01T00:00:00.000Z')
  const pastDue = new Date('2026-07-01T00:30:00.000Z')
  const now = new Date('2026-07-01T02:00:00.000Z')

  it('isSlaPausedForOperatorQueue only for AWAITING_APPROVAL', () => {
    expect(isSlaPausedForOperatorQueue('AWAITING_APPROVAL')).toBe(true)
    expect(isSlaPausedForOperatorQueue('OPEN')).toBe(false)
    expect(isSlaPausedForOperatorQueue('RESOLVED')).toBe(false)
  })

  it('does not count breach while awaiting Approve', () => {
    expect(
      isSlaBreached({
        firstResponseAt: null,
        firstResponseDueAt: pastDue,
        resolveDueAt: pastDue,
        status: 'AWAITING_APPROVAL',
        now,
      })
    ).toBe(false)
  })

  it('evaluateSla shows Awaiting Approve not Breached', () => {
    const view = evaluateSla({
      createdAt,
      intakeGate: 'OTHER',
      firstResponseDueAt: pastDue,
      resolveDueAt: pastDue,
      status: 'AWAITING_APPROVAL',
      slaBreachedAt: new Date('2026-07-01T01:00:00.000Z'),
      now,
    })
    expect(view.status).toBe('warn')
    expect(view.shape).toBe('▲')
    expect(view.label).toBe('Awaiting Approve')
    expect(view.slaBreachedAt).toBeNull()
  })

  it('still breaches when OPEN and past due', () => {
    expect(
      isSlaBreached({
        firstResponseAt: null,
        firstResponseDueAt: pastDue,
        resolveDueAt: pastDue,
        status: 'OPEN',
        now,
      })
    ).toBe(true)
  })
})
