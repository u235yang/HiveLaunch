import { useQuery } from '@tanstack/react-query'
import { getBranchStatus } from '../lib/git-operations'

export interface BranchStatus {
  commits_ahead: number
  commits_behind: number
  has_uncommitted_changes: boolean
  conflicted_files: string[]
  current_branch: string
  is_rebase_in_progress: boolean
  is_merge_in_progress: boolean
  conflict_op: string | null
}

interface FetchBranchStatusParams {
  worktreePath: string
  targetBranch: string
}

async function fetchBranchStatus({
  worktreePath,
  targetBranch,
}: FetchBranchStatusParams): Promise<BranchStatus> {
  return getBranchStatus(worktreePath, targetBranch)
}

export function useGitBranchStatus(worktreePath: string, targetBranch: string) {
  return useQuery({
    queryKey: ['git-branch-status', worktreePath, targetBranch],
    queryFn: () => fetchBranchStatus({ worktreePath, targetBranch }),
    enabled: !!worktreePath,
    refetchInterval: 5000,
  })
}
