import { afterEach, describe, expect, it } from 'vitest'
import { getRuntimeIdentity } from './runtime-identity'

const KEYS = ['RENDER_GIT_COMMIT', 'RENDER_GIT_BRANCH'] as const

afterEach(() => {
  for (const k of KEYS) delete process.env[k]
})

describe('getRuntimeIdentity', () => {
  it('prefers Render env and shortens SHA to 7 chars', () => {
    process.env.RENDER_GIT_COMMIT = '3e3ff6fabc123deadbeef'
    process.env.RENDER_GIT_BRANCH = 'main'
    const id = getRuntimeIdentity()
    expect(id.commit).toBe('3e3ff6f')
    expect(id.branch).toBe('main')
    expect(id.source).toBe('render')
  })

  it('falls back to local git or unknown — never throws', () => {
    const id = getRuntimeIdentity()
    expect(id.source === 'git' || id.source === 'unknown').toBe(true)
    if (id.commit) expect(id.commit.length).toBeGreaterThanOrEqual(4)
  })
})
