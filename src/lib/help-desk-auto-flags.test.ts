import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
] as const

const originals: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const key of KEYS) {
    originals[key] = process.env[key]
    delete process.env[key]
  }
})
afterEach(() => {
  for (const key of KEYS) {
    if (originals[key] === undefined) delete process.env[key]
    else process.env[key] = originals[key]
  }
})

describe('DrOS fail-closed autonomous actions', () => {
  it('never autoapproves customer-facing replies when environment flags are missing', () => {
    expect(envEchoAutoApprove()).toBe(false)
    expect(envHelpDeskAutoApprove()).toBe(false)
    expect(envHelpDeskAutoSendTech()).toBe(false)
  })

  it('does not convert malformed, blank, or negative flags into authority', () => {
    for (const value of ['', 'enabled', 'maybe', 'autopilot', 'false', 'off', '0', 'no']) {
      process.env.ECHO_AUTO_APPROVE = value
      process.env.HELP_DESK_AUTO_APPROVE = value
      process.env.HELP_DESK_AUTO_SEND_TECH = value
      expect(envEchoAutoApprove()).toBe(false)
      expect(envHelpDeskAutoApprove()).toBe(false)
      expect(envHelpDeskAutoSendTech()).toBe(false)
    }
  })

  it('requires a positive explicit opt-in for low-risk text autoapprovals', () => {
    for (const value of ['true', '1', 'yes', 'on', ' TRUE ']) {
      process.env.ECHO_AUTO_APPROVE = value
      process.env.HELP_DESK_AUTO_APPROVE = value
      process.env.HELP_DESK_AUTO_SEND_TECH = value
      expect(envEchoAutoApprove()).toBe(true)
      expect(envHelpDeskAutoApprove()).toBe(true)
      expect(envHelpDeskAutoSendTech()).toBe(true)
    }
  })

  it('honors Echo alias but primary deny cannot be overridden by alias', () => {
    process.env.HELP_DESK_ECHO_AUTO_APPROVE = 'true'
    expect(envEchoAutoApprove()).toBe(true)
    process.env.ECHO_AUTO_APPROVE = 'false'
    expect(envEchoAutoApprove()).toBe(false)
  })

  it('keeps safe draft-only Knights enabled unless explicitly disabled', () => {
    expect(shouldAutoKnightsOnQuestion()).toBe(true)
    process.env.AUTO_KNIGHTS_ON_QUESTION = 'false'
    process.env.AUTONOMY_DIAL = 'autopilot'
    process.env.KNIGHTS_STANDBY_MODE = 'auto_answer_low_risk'
    expect(shouldAutoKnightsOnQuestion()).toBe(false)
  })

  it('does not silently re-enable Knights drafting on malformed settings', () => {
    process.env.AUTO_KNIGHTS_ON_QUESTION = 'invalid'
    expect(shouldAutoKnightsOnQuestion()).toBe(false)
    process.env.AUTO_KNIGHTS_ON_QUESTION = 'yes'
    expect(shouldAutoKnightsOnQuestion()).toBe(true)
  })

  it('enabling non-executing Knights drafting does not authorize any auto-send', () => {
    process.env.AUTO_KNIGHTS_ON_QUESTION = 'on'
    expect(shouldAutoKnightsOnQuestion()).toBe(true)
    expect(envHelpDeskAutoApprove()).toBe(false)
    expect(envEchoAutoApprove()).toBe(false)
    expect(envHelpDeskAutoSendTech()).toBe(false)
  })
})
