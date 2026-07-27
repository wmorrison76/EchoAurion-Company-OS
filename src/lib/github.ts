import type { GitHubRepoHealth } from '@/types/dr-os'
import type { StatusLevel } from '@/types'
import { truncate } from '@/lib/utils'

const GITHUB_API = 'https://api.github.com'
const DAY_MS = 24 * 60 * 60 * 1000

// Repos to monitor (CLAUDE.md §10.2).
export const MONITORED_REPOS: ReadonlyArray<{ owner: string; repo: string }> = [
  { owner: 'wmorrison76', repo: 'EchoAurion-Company-OS' },
  { owner: 'wmorrison76', repo: 'Echo_Aurion-LUCCCA_Framework' },
]

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function gh(path: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
}

/** Reads the total count of an open-list endpoint via the Link header. */
async function countOpen(owner: string, repo: string, kind: 'pulls' | 'issues'): Promise<number> {
  const res = await gh(`/repos/${owner}/${repo}/${kind}?state=open&per_page=1`)
  if (!res.ok) throw new Error(`GitHub ${kind} ${res.status}`)
  const link = res.headers.get('link')
  if (link) {
    const last = link.split(',').find((s) => s.includes('rel="last"'))
    const match = last?.match(/[?&]page=(\d+)/)
    if (match) return Number(match[1])
  }
  const body = (await res.json()) as unknown[]
  return Array.isArray(body) ? body.length : 0
}

function levelFor(committedAt: string | null): { level: StatusLevel; label: GitHubRepoHealth['label'] } {
  if (!committedAt) return { level: 'unknown', label: 'Unknown' }
  const age = Date.now() - new Date(committedAt).getTime()
  if (age < 7 * DAY_MS) return { level: 'ok', label: 'Active' }
  if (age < 30 * DAY_MS) return { level: 'warn', label: 'Stale' }
  return { level: 'error', label: 'Inactive' }
}

/** Operator-facing GitHub API errors — never stay as bare "Unknown" forever. */
function explainGitHubFailure(
  fullName: string,
  status: number,
  kind: 'commits' | 'repo' | 'pulls' | 'issues'
): string {
  const hasToken = Boolean(process.env.GITHUB_TOKEN?.trim())
  if (status === 401) {
    return hasToken
      ? 'GITHUB_TOKEN invalid or expired — regenerate PAT with repo read'
      : 'GITHUB_TOKEN not set — paste a PAT with repo read on Render'
  }
  if (status === 403) {
    return 'GITHUB_TOKEN needs repo read scope (public_repo or full repo for private)'
  }
  if (status === 404) {
    // Private repos often return 404 instead of 403 when the token cannot see them.
    return hasToken
      ? `GitHub ${kind} 404 for ${fullName} — verify repo name or token needs repo read (private repos look like 404 without access)`
      : 'GITHUB_TOKEN not set — private repos return 404 without a PAT (repo read)'
  }
  if (status === 429) {
    return 'GitHub rate limit — wait or use an authenticated GITHUB_TOKEN'
  }
  return `GitHub ${kind} ${status}`
}

export async function getRepoHealth(owner: string, repo: string): Promise<GitHubRepoHealth> {
  const fullName = `${owner}/${repo}`
  if (!process.env.GITHUB_TOKEN?.trim()) {
    return {
      repo: fullName,
      level: 'unknown',
      label: 'Unknown',
      sha: null,
      message: null,
      author: null,
      committedAt: null,
      openPRs: null,
      openIssues: null,
      error: 'GITHUB_TOKEN not set — paste PAT with repo read on Render',
    }
  }
  try {
    // Repo metadata first — clearer 404 vs wrong name before commits.
    const repoRes = await gh(`/repos/${owner}/${repo}`)
    if (!repoRes.ok) {
      return {
        repo: fullName,
        level: 'unknown',
        label: 'Unknown',
        sha: null,
        message: null,
        author: null,
        committedAt: null,
        openPRs: null,
        openIssues: null,
        error: explainGitHubFailure(fullName, repoRes.status, 'repo'),
      }
    }

    const commitsRes = await gh(`/repos/${owner}/${repo}/commits?per_page=1`)
    if (!commitsRes.ok) {
      return {
        repo: fullName,
        level: 'unknown',
        label: 'Unknown',
        sha: null,
        message: null,
        author: null,
        committedAt: null,
        openPRs: null,
        openIssues: null,
        error: explainGitHubFailure(fullName, commitsRes.status, 'commits'),
      }
    }
    const commits = (await commitsRes.json()) as Array<{
      sha: string
      commit: { message: string; author: { name: string; date: string } | null }
      author: { login: string } | null
    }>
    const latest = commits[0]
    const committedAt = latest?.commit.author?.date ?? null
    const { level, label } = levelFor(committedAt)

    // Open PR + issue counts are best-effort; failure here should not blank the panel.
    const [openPRs, openIssuesRaw] = await Promise.allSettled([
      countOpen(owner, repo, 'pulls'),
      countOpen(owner, repo, 'issues'),
    ])
    const prs = openPRs.status === 'fulfilled' ? openPRs.value : null
    // GitHub's issues endpoint counts PRs too; subtract them when both are known.
    const issuesTotal = openIssuesRaw.status === 'fulfilled' ? openIssuesRaw.value : null
    const openIssues =
      issuesTotal !== null && prs !== null ? Math.max(0, issuesTotal - prs) : issuesTotal

    return {
      repo: fullName,
      level,
      label,
      sha: latest ? latest.sha.slice(0, 7) : null,
      message: latest ? truncate(latest.commit.message.split('\n')[0], 60) : null,
      author: latest?.commit.author?.name ?? latest?.author?.login ?? null,
      committedAt,
      openPRs: prs,
      openIssues,
    }
  } catch (error) {
    return {
      repo: fullName,
      level: 'unknown',
      label: 'Unknown',
      sha: null,
      message: null,
      author: null,
      committedAt: null,
      openPRs: null,
      openIssues: null,
      error: error instanceof Error ? error.message : 'GitHub request failed',
    }
  }
}

export async function getAllRepoHealth(): Promise<GitHubRepoHealth[]> {
  return Promise.all(MONITORED_REPOS.map(({ owner, repo }) => getRepoHealth(owner, repo)))
}
