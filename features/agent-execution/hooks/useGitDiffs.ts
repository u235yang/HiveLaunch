import { useQuery } from '@tanstack/react-query'
import { getDiff } from '../lib/git-operations'

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  additions: number
  deletions: number
  diff?: string
}

async function fetchDiffs(worktreePath: string): Promise<FileDiff[]> {
  try {
    return await getDiff(worktreePath)
  } catch {
    return []
  }
}

export function useGitDiffs(worktreePath: string) {
  return useQuery({
    queryKey: ['git-diffs', worktreePath],
    queryFn: () => fetchDiffs(worktreePath),
    enabled: !!worktreePath,
    refetchInterval: 5000,
  })
}
