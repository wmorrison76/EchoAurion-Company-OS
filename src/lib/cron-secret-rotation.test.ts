import { describe, expect, it } from 'vitest'

import {
  fanOutCronSecret,
  gateCronSecretRotation,
  selectCronSecretHolders,
  type CronSecretHolder,
} from './cron-secret-rotation'

const svc = (name: string, type = 'cron_job', id = `srv-${name}`) => ({ id, name, type })

const FLEET = [
  svc('echoaurion-company-os', 'web_service'),
  svc('echoaurion-company-os-sync'),
  svc('echoaurion-company-os-briefing'),
  svc('echoaurion-company-os-desk-moles'),
  svc('echoaurion-company-os-db-backup'),
  svc('luccca-py-api', 'web_service'),
  svc('unrelated-service', 'web_service'),
]

describe('selectCronSecretHolders', () => {
  it('discovers every prefixed service and marks the web one', () => {
    const { holders } = selectCronSecretHolders(FLEET)
    expect(holders.map((h) => h.name)).toEqual([
      'echoaurion-company-os',
      'echoaurion-company-os-briefing',
      'echoaurion-company-os-db-backup',
      'echoaurion-company-os-desk-moles',
      'echoaurion-company-os-sync',
    ])
    expect(holders.filter((h) => h.isWeb).map((h) => h.name)).toEqual(['echoaurion-company-os'])
  })

  it('picks up a cron added later without a code change', () => {
    const { holders } = selectCronSecretHolders([...FLEET, svc('echoaurion-company-os-brand-new')])
    expect(holders.map((h) => h.name)).toContain('echoaurion-company-os-brand-new')
  })

  it('excludes services outside the prefix unless named as extra holders', () => {
    const withoutExtras = selectCronSecretHolders(FLEET)
    expect(withoutExtras.holders.map((h) => h.name)).not.toContain('luccca-py-api')

    const withExtras = selectCronSecretHolders(FLEET, { extraNames: ['luccca-py-api'] })
    expect(withExtras.holders.map((h) => h.name)).toContain('luccca-py-api')
    expect(withExtras.missingExtras).toEqual([])
    expect(withExtras.holders.find((h) => h.name === 'luccca-py-api')?.isWeb).toBe(false)
  })

  it('reports extra holders that do not exist so rotation can refuse', () => {
    const { missingExtras } = selectCronSecretHolders(FLEET, { extraNames: ['ghost-service'] })
    expect(missingExtras).toEqual(['ghost-service'])
  })

  it('treats RENDER_SERVICE_ID as the web holder even if renamed', () => {
    const renamed = [svc('company-os-web-renamed', 'web_service', 'srv-web-1'), svc('echoaurion-company-os-sync')]
    const { holders } = selectCronSecretHolders(renamed, {
      extraNames: ['company-os-web-renamed'],
      webServiceId: 'srv-web-1',
    })
    expect(holders.find((h) => h.name === 'company-os-web-renamed')?.isWeb).toBe(true)
  })
})

const holders = (): CronSecretHolder[] => [
  { id: 'srv-web', name: 'echoaurion-company-os', type: 'web_service', isWeb: true, source: 'prefix' },
  { id: 'srv-a', name: 'echoaurion-company-os-sync', type: 'cron_job', isWeb: false, source: 'prefix' },
  { id: 'srv-b', name: 'echoaurion-company-os-desk-moles', type: 'cron_job', isWeb: false, source: 'prefix' },
]

describe('fanOutCronSecret', () => {
  it('writes every holder and reports them all', async () => {
    const written: string[] = []
    const result = await fanOutCronSecret(holders(), async (h) => {
      written.push(h.name)
    })
    expect(result.ok).toBe(true)
    expect(result.phase).toBe('complete')
    expect(written.sort()).toEqual(holders().map((h) => h.name).sort())
    expect(result.failed).toEqual([])
  })

  it('writes web last so the verifier flips only after crons hold the new value', async () => {
    const order: string[] = []
    await fanOutCronSecret(holders(), async (h) => {
      order.push(h.name)
    })
    expect(order[order.length - 1]).toBe('echoaurion-company-os')
  })

  it('aborts before touching web when any cron write fails', async () => {
    const written: string[] = []
    const result = await fanOutCronSecret(holders(), async (h) => {
      if (h.name === 'echoaurion-company-os-desk-moles') throw new Error('Render 403')
      written.push(h.name)
    })
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('aborted_before_web')
    expect(written).not.toContain('echoaurion-company-os')
    expect(result.notAttempted).toEqual(['echoaurion-company-os'])
    expect(result.failed).toEqual([{ name: 'echoaurion-company-os-desk-moles', error: 'Render 403' }])
    expect(result.updated).toEqual(['echoaurion-company-os-sync'])
  })

  it('flags a partial rotation when only the web write fails', async () => {
    const result = await fanOutCronSecret(holders(), async (h) => {
      if (h.isWeb) throw new Error('Render 500')
    })
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('web_failed')
    expect(result.failed).toEqual([{ name: 'echoaurion-company-os', error: 'Render 500' }])
    expect(result.updated.sort()).toEqual([
      'echoaurion-company-os-desk-moles',
      'echoaurion-company-os-sync',
    ])
  })

  it('refuses a holder set with no web service', async () => {
    const cronsOnly = holders().filter((h) => !h.isWeb)
    await expect(fanOutCronSecret(cronsOnly, async () => {})).rejects.toThrow(/no web service/i)
  })
})

describe('gateCronSecretRotation', () => {
  it('requires the explicit confirm flag', () => {
    const gate = gateCronSecretRotation({
      actor: 'william_morrison',
      confirmed: false,
      agentRotationAllowed: false,
    })
    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('ROTATION_NOT_CONFIRMED')
  })

  it('allows a confirmed admin rotation', () => {
    const gate = gateCronSecretRotation({
      actor: 'william_morrison',
      confirmed: true,
      agentRotationAllowed: false,
    })
    expect(gate.allowed).toBe(true)
  })

  it('denies computer_agent rotation by default per the constitution', () => {
    const gate = gateCronSecretRotation({
      actor: 'computer_agent',
      confirmed: true,
      agentRotationAllowed: false,
    })
    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('ROTATION_NEEDS_HUMAN')
    expect(gate.reason).toMatch(/dual human control/i)
  })

  it('still requires a named approver when the agent flag is on', () => {
    const gate = gateCronSecretRotation({
      actor: 'computer_agent',
      confirmed: true,
      agentRotationAllowed: true,
    })
    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('ROTATION_NEEDS_APPROVER')
  })

  it('allows an approved agent rotation once a human opted in', () => {
    const gate = gateCronSecretRotation({
      actor: 'computer_agent',
      confirmed: true,
      approvedBy: 'william_morrison',
      agentRotationAllowed: true,
    })
    expect(gate.allowed).toBe(true)
  })
})
