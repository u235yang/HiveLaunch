// F3: Git Commit Hook
// 提交当前变更

'use client'

import { useState, useCallback } from 'react'
import { commit, CommitResult } from '../lib/git-operations'

interface UseCommitOptions {
  onSuccess?: (result: CommitResult) => void
  onError?: (error: string) => void
}

export function useCommit(options: UseCommitOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)

  const commitChanges = useCallback(async (worktreePath: string, message: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const commitResult = await commit(worktreePath, message)
      setResult(commitResult)
      
      if (commitResult.success) {
        options.onSuccess?.(commitResult)
      } else {
        setError(commitResult.message)
        options.onError?.(commitResult.message)
      }
      
      return commitResult
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      options.onError?.(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [options])

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return {
    commitChanges,
    isLoading,
    error,
    result,
    reset,
  }
}
