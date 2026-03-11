import { useQuery } from '@tanstack/react-query'
import { listWorktreeFiles, previewWorktreeFile } from '../lib/git-operations'

function shouldRetryWorktreeRequest(failureCount: number, error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false
  }
  return failureCount < 3
}

export function useWorktreeFiles(worktreePath: string, path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['worktree-files', worktreePath, path],
    queryFn: () => listWorktreeFiles(worktreePath, path),
    enabled: enabled && !!worktreePath,
    staleTime: 30_000,
    retry: shouldRetryWorktreeRequest,
  })
}

export function useWorktreeFilePreview(
  worktreePath: string,
  filePath: string | null,
  maxBytes: number = 200_000
) {
  return useQuery({
    queryKey: ['worktree-file-preview', worktreePath, filePath, maxBytes],
    queryFn: () => previewWorktreeFile(worktreePath, filePath ?? '', maxBytes),
    enabled: !!worktreePath && !!filePath,
    retry: shouldRetryWorktreeRequest,
  })
}
