// Phase 2 — the Architect seat (Claude Code) does real codebase work by
// triggering a GitHub Actions workflow_dispatch. The workflow itself
// (.github/workflows/board-room-architect.yml) runs the Claude Code action.

const REPO = `${process.env.GITHUB_ORG ?? 'wmorrison76'}/EchoAurion-Company-OS`
const WORKFLOW = 'board-room-architect.yml'

export interface ArchitectDispatch {
  dispatched: boolean
  detail: string
}

export async function dispatchArchitect(task: string, ref = 'main'): Promise<ArchitectDispatch> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return { dispatched: false, detail: 'GITHUB_TOKEN not set' }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref, inputs: { task: task.slice(0, 60_000) } }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (res.status === 204) return { dispatched: true, detail: 'workflow_dispatch accepted' }
    if (res.status === 404) {
      return { dispatched: false, detail: 'Workflow not found on the target ref (needs repo:write + workflow on default branch)' }
    }
    return { dispatched: false, detail: `GitHub ${res.status}` }
  } catch (error) {
    return {
      dispatched: false,
      detail: error instanceof Error ? error.message : 'Dispatch failed',
    }
  }
}
