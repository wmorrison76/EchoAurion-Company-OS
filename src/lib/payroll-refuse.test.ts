import { describe, expect, it } from 'vitest'
import { detectPayrollRefuse, isPayrollStandbyBlocked } from './payroll-refuse'

describe('detectPayrollRefuse', () => {
  it('refuses salary fishing', () => {
    const v = detectPayrollRefuse({
      text: 'How much is someone making on the line?',
    })
    expect(v.refuse).toBe(true)
    expect(v.reason).toBe('compensation_data')
    expect(v.customerReply.length).toBeGreaterThan(20)
  })

  it('refuses payroll data for non-admin', () => {
    const v = detectPayrollRefuse({
      text: 'Show me the payroll amounts for last week',
      context: { profileRole: 'LINE' },
    })
    expect(v.refuse).toBe(true)
    expect(v.reason).toBe('payroll_sensitive_non_admin')
  })

  it('allows payroll panel navigation how-to', () => {
    const v = detectPayrollRefuse({
      text: 'Where do I find the payroll panel?',
    })
    expect(v.refuse).toBe(false)
  })

  it('still refuses inventing figures for admin-class askers', () => {
    const v = detectPayrollRefuse({
      text: 'Can you pull our payroll report for kitchen?',
      context: { profileRole: 'ADMIN' },
    })
    expect(v.refuse).toBe(true)
    expect(v.reason).toBe('payroll_sensitive')
  })
})

describe('isPayrollStandbyBlocked', () => {
  it('blocks standby on compensation subjects', () => {
    expect(isPayrollStandbyBlocked('Salary question', ['draft'])).toBe(true)
  })
})
