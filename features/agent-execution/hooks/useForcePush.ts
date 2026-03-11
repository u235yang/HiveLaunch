// F3: Git Force Push Hook
// Force Push 操作

'use client'

import { useState, useCallback } from 'react'
import { forcePush, PushResult } from '../lib/git-operations'

interface UseForcePushOptions {
  onSuccess?: (result: PushResult) => void
  onError?: (error: string) => void
}

export function useForcePush(options: UseForcePushOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PushResult | null>(null)

  const performForcePush = useCallback(async (
    worktreePath: string,
    remote: string = 'origin',
    branch: string
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      const pushResult = await forcePush(worktreePath, remote, branch)
      setResult(pushResult)

      if (pushResult.success) {
        options.onSuccess?.(pushResult)
      } else {
        setError(pushResult.message)
        options.onError?.(pushResult.message)
      }

      return pushResult
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
    performForcePush,
    isLoading,
    error,
    result,
    reset,
  }
}
