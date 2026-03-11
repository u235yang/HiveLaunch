import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { GitOperationError } from './useGitMerge'
import { resolveHttpUrl } from '../lib/api-config'

interface PushParams {
  worktreePath: string
  remote?: string
  branch?: string
  force?: boolean
}

async function fetchPush(params: PushParams): Promise<{ success: boolean; message?: string; error?: GitOperationError }> {
  const response = await fetch(resolveHttpUrl('/api/git/push'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  return response.json()
}

export function useGitPush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fetchPush,
    onSuccess: () => {
      // 成功后刷新 branch status
      queryClient.invalidateQueries({ queryKey: ['git-branch-status'] })
    },
    onError: () => {
      // 失败后也刷新
      queryClient.invalidateQueries({ queryKey: ['git-branch-status'] })
    },
  })
}
