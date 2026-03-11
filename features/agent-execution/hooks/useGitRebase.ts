import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { GitOperationError } from './useGitMerge'
import { resolveHttpUrl } from '../lib/api-config'

interface RebaseParams {
  worktreePath: string
  targetBranch: string
}

async function fetchRebase(params: RebaseParams): Promise<{ success: boolean; message?: string; error?: GitOperationError }> {
  const response = await fetch(resolveHttpUrl('/api/git/rebase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  return response.json()
}

export function useGitRebase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fetchRebase,
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
