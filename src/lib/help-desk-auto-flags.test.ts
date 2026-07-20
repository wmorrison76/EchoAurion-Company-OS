import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  envEchoAutoApprove,
  envHelpDeskAutoApprove,
  envHelpDeskAutoSendTech,
  shouldAutoKnightsOnQuestion,
} from './help-desk-auto-flags'

const KEYS = [
  'ECHO_AUTO_APPROVE',
  'HELP_DESK_ECHO_AUTO_APPROVE',
  'HELP_DESK_AUTO_APPROVE',
  'HELP_DESK_AUTO_SEND_TECH',
  'AUTO_KNIGHTS_ON_QUESTION',
  'AUTONOMY_DIAL',
  'KNIGHTS_STANDBY_MODE',
  'NODE_ENV',
] as const

afterEach(() => {
  for (const k of KEYS) delete process.env[k]
})

describe('envEchoAutoApprove', () => {
  it('defaults true when unset (testing)', () => {
    expect(envEchoAutoApprove()).toBe(true)
  })

  it('respects ECHO_AUTO_APPROVE=false for prod dual-control', () => {
    process.env.ECHO_AUTO_APPROVE = 'false'
    expect(envEchoAutoApprove()).toBe(false)
  })

  it('accepts HELP_DESK_ECHO_AUTO_APPROVE alias', () => {
    process.env.HELP_DESK_ECHO_AUTO_APPROVE = 'off'
    expect(envEchoAutoApprove()).toBe(false)
    process.env.HELP_DESK_ECHO_AUTO_APPROVE = 'on'
    expect(envEchoAutoApprove()).toBe(true)
  })

  it('ECHO_AUTO_APPROVE wins over alias when both set', () => {
    process.env.ECHO_AUTO_APPROVE = 'true'
    process.env.HELP_DESK_ECHO_AUTO_APPROVE = 'false'
    expect(envEchoAutoApprove()).toBe(true)
  })
})

describe('envHelpDeskAutoApprove', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults true in development when unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(envHelpDeskAutoApprove()).toBe(true)
  })

  it('defaults false in production when unset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(envHelpDeskAutoApprove()).toBe(false)
  })

  it('respects HELP_DESK_AUTO_APPROVE=true on production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.HELP_DESK_AUTO_APPROVE = 'true'
    expect(envHelpDeskAutoApprove()).toBe(true)
  })

  it('respects HELP_DESK_AUTO_APPROVE=false even in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    process.env.HELP_DESK_AUTO_APPROVE = 'false'
    expect(envHelpDeskAutoApprove()).toBe(false)
  })
})

describe('envHelpDeskAutoSendTech', () => {
  it('defaults false when unset', () => {
    expect(envHelpDeskAutoSendTech()).toBe(false)
  })
})

describe('shouldAutoKnightsOnQuestion', () => {
  it('defaults true when unset', () => {
    expect(shouldAutoKnightsOnQuestion()).toBe(true)
  })
})
