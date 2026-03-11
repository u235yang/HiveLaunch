import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { GitOperationError } from './useGitMerge'
import { resolveHttpUrl } from '../lib/api-config'

interface PullParams {
  worktreePath: string
  remote?: string
  branch?: string
}

interface PullResult {
  success: boolean
  message?: string
  error?: GitOperationError
}

async function fetchPull(params: PullParams): Promise<PullResult> {
  const response = await fetch(resolveHttpUrl('/api/git/pull'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  return response.json()
}

export function useGitPull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fetchPull,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['git-branch-status'] })
      queryClient.invalidateQueries({ queryKey: ['git-diffs'] })
    },
  })
}
