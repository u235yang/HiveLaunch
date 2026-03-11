// F3: useProjectBranches - 获取项目仓库的分支列表
// 用于创建任务时选择分支

import { useState, useEffect, useCallback } from 'react'
import { resolveHttpUrl } from '../lib/api-config'

export interface GitBranch {
  name: string
  is_current: boolean
  is_remote: boolean
}

interface UseProjectBranchesOptions {
  /** 项目仓库路径，优先使用此参数 */
  repoPath?: string | null
}

interface UseProjectBranchesReturn {
  branches: GitBranch[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** 当前使用的仓库路径 */
  currentPath: string | null
}

export function useProjectBranches(options: UseProjectBranchesOptions = {}): UseProjectBranchesReturn {
  const { repoPath: projectRepoPath } = options
  
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)

  const fetchBranches = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // 优先使用传入的 repoPath（必须有明确值才使用）
      if (!projectRepoPath || projectRepoPath.trim() === '') {
        setError('请先选择项目或配置仓库路径')
        setBranches([])
        setCurrentPath(null)
        setIsLoading(false)
        return
      }

      const dir = projectRepoPath
      setCurrentPath(dir)

      // 使用 HTTP API 获取分支列表
      const encodedPath = encodeURIComponent(dir)
      const response = await fetch(resolveHttpUrl(`/api/git/branches?path=${encodedPath}`))

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const branchList = await response.json()

      // 分离本地分支和远程分支，优先显示本地分支
      const localBranches = branchList.filter((b: GitBranch) => !b.is_remote)
      const remoteBranches = branchList.filter((b: GitBranch) => b.is_remote)

      setBranches([...localBranches, ...remoteBranches])
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      // 如果是路径问题，给出更清晰的错误信息
      if (errorMsg.includes('Path does not exist')) {
        setError('仓库目录不存在，请检查路径配置')
      } else if (errorMsg.includes('Not a git repository')) {
        setError('指定的目录不是 Git 仓库')
      } else {
        setError(errorMsg)
      }
      setBranches([])
    } finally {
      setIsLoading(false)
    }
  }, [projectRepoPath])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  return {
    branches,
    isLoading,
    error,
    refetch: fetchBranches,
    currentPath,
  }
}
