import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveHttpUrl } from '../lib/api-config'

export interface GitOperationError {
  type: 'merge_conflicts' | 'rebase_in_progress' | 'unknown'
  message: string
  conflicted_files?: string[]
}

interface MergeParams {
  worktreePath: string
  targetBranch: string
}

async function fetchMerge(params: MergeParams): Promise<{ success: boolean; message?: string; error?: GitOperationError }> {
  const response = await fetch(resolveHttpUrl('/api/git/merge'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  return response.json()
}

export function useGitMerge() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fetchMerge,
    onSuccess: () => {
      // 成功后刷新 branch status
      queryClient.invalidateQueries({ queryKey: ['git-branch-status'] })
    },
    onError: () => {
      // 失败后也刷新以获取冲突状态
      queryClient.invalidateQueries({ queryKey: ['git-branch-status'] })
    },
  })
}
