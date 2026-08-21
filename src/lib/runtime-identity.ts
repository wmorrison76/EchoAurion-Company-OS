/**
 * Deploy / local git identity for public health — never secrets.
 * Render sets RENDER_GIT_COMMIT + RENDER_GIT_BRANCH on every deploy.
 * Local fallback uses git; health must not fail if git is missing.
 */

import { execFileSync } from 'child_process'

export type RuntimeIdentitySource = 'render' | 'git' | 'unknown'

export type RuntimeIdentity = {
  /** Short SHA (7 chars) or null when unknown. */
  commit: string | null
  branch: string | null
  source: RuntimeIdentitySource
}

function shortSha(raw: string): string {
  return raw.replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 7)
}

function readGitIdentity(): { commit: string | null; branch: string | null } {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return {
      commit: commit && /^[0-9a-f]{4,40}$/i.test(commit) ? commit : null,
      branch: branch && branch !== 'HEAD' ? branch : null,
    }
  } catch {
    return { commit: null, branch: null }
  }
}

export function getRuntimeIdentity(): RuntimeIdentity {
  const renderCommit = process.env.RENDER_GIT_COMMIT?.trim()
  const renderBranch = process.env.RENDER_GIT_BRANCH?.trim()
  if (renderCommit) {
    return {
      commit: shortSha(renderCommit),
      branch: renderBranch ? renderBranch.slice(0, 80) : null,
      source: 'render',
    }
  }
  const git = readGitIdentity()
  if (git.commit) {
    return { commit: git.commit, branch: git.branch, source: 'git' }
  }
  return { commit: null, branch: null, source: 'unknown' }
}
