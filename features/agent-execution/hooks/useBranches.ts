// F3: Git Branches Hook
// 获取分支列表

'use client'

import { useState, useCallback, useEffect } from 'react'
import { listBranches, getCurrentBranch, GitBranch } from '../lib/git-operations'

export function useBranches(worktreePath: string | null) {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBranches = useCallback(async () => {
    if (!worktreePath) {
      setBranches([])
      setCurrentBranch('')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [branchList, current] = await Promise.all([
        listBranches(worktreePath),
        getCurrentBranch(worktreePath),
      ])
      
      setBranches(branchList)
      setCurrentBranch(current)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [worktreePath])

  // 自动加载分支
  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  // 获取本地分支（排除 remote）
  const localBranches = branches.filter(b => !b.is_remote)

  // 获取远程分支
  const remoteBranches = branches.filter(b => b.is_remote)

  return {
    branches,
    localBranches,
    remoteBranches,
    currentBranch,
    isLoading,
    error,
    refetch: fetchBranches,
  }
}
