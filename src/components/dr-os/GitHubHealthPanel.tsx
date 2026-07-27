import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { GitHubRepoHealth } from '@/types/dr-os'

export function GitHubHealthPanel({ data }: { data?: GitHubRepoHealth[] }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard title="GitHub Repos">
      <ul className="flex flex-col divide-y divide-[#2a2a3f]">
        {data.map((repo) => (
          <li key={repo.repo} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-white">
                {repo.repo.split('/')[1]}
              </span>
              <StatusBadge level={repo.level} label={repo.label} />
            </div>
            {repo.error ? (
              <p className="text-xs text-[#a0a0b8]" role="status">
                {repo.error.startsWith('GITHUB_TOKEN') || repo.error.includes('repo read')
                  ? repo.error
                  : `Error: ${repo.error}`}
              </p>
            ) : (
              <>
                <p className="truncate text-xs text-[#a0a0b8]">
                  {repo.sha ? (
                    <span className="font-mono text-[#5a5a78]">{repo.sha}</span>
                  ) : null}{' '}
                  {repo.message ?? 'No commits'}
                </p>
                <p className="text-xs text-[#5a5a78]">
                  {repo.author ? `${repo.author} · ` : ''}
                  {repo.committedAt
                    ? formatDistanceToNow(new Date(repo.committedAt), { addSuffix: true })
                    : '—'}
                  {' · '}
                  {repo.openPRs ?? 0} PRs · {repo.openIssues ?? 0} issues
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </KPICard>
  )
}
