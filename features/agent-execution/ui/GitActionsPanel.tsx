'use client'

import { useEffect, useState } from 'react'
import {
  GitBranch,
  GitPullRequest,
  GitCommit,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'
import { useGitBranchStatus, useGitMerge, useGitPush, useGitRebase, type GitOperationError } from '../hooks'
import { createPullRequest } from '../lib/git-operations'
import { CommitDialog } from './CommitDialog'
import { useUIStore } from '@/features/shared/store'

type GitActionMode = 'direct' | 'pr'

interface GitActionsPanelProps {
  worktreePath: string
  targetBranch: string
  branchName?: string
  onMergeSuccess?: () => void
  onPRCreated?: (url: string) => void
  onDirectPushSuccess?: () => void
}

export function GitActionsPanel({
  worktreePath,
  targetBranch,
  branchName,
  onMergeSuccess,
  onPRCreated,
  onDirectPushSuccess,
}: GitActionsPanelProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const { data: status, isLoading, error, refetch } = useGitBranchStatus(worktreePath, targetBranch)
  const mergeMutation = useGitMerge()
  const pushMutation = useGitPush()
  const rebaseMutation = useGitRebase()

  // 本地状态
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<GitActionMode>('direct')
  const [hasMergedToTarget, setHasMergedToTarget] = useState(false)
  const [hasPushedInPrMode, setHasPushedInPrMode] = useState(false)
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false)

  // 计算状态
  const hasConflicts = (status?.conflicted_files?.length ?? 0) > 0
  const isRebaseInProgress = status?.is_rebase_in_progress ?? false
  const isMergeInProgress = status?.is_merge_in_progress ?? false
  const commitsAhead = status?.commits_ahead ?? 0
  const commitsBehind = status?.commits_behind ?? 0
  const currentBranch = status?.current_branch ?? ''
  const hasUncommittedChanges = status?.has_uncommitted_changes ?? false
  const isBlockedByConflict = hasConflicts || isRebaseInProgress || isMergeInProgress

  useEffect(() => {
    setHasMergedToTarget(false)
    setHasPushedInPrMode(false)
    setMode('direct')
    setErrorMessage(null)
    setSuccessMessage(null)
  }, [worktreePath, currentBranch, targetBranch])

  // 检测冲突错误类型
  const isConflictError = (error: unknown): error is GitOperationError => {
    return !!error && typeof error === 'object' && 'type' in error &&
      ((error as GitOperationError).type === 'merge_conflicts' || (error as GitOperationError).type === 'rebase_in_progress')
  }

  const handleMerge = async () => {
    if (!worktreePath || !targetBranch || mode !== 'direct') return
    
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await mergeMutation.mutateAsync({
        worktreePath,
        targetBranch,
      })

      if (result.success) {
        setSuccessMessage(`Successfully merged ${targetBranch}`)
        setHasMergedToTarget(true)
        onMergeSuccess?.()
        refetch()
      } else if (result.error) {
        // 冲突错误
        if (result.error.type === 'merge_conflicts') {
          setErrorMessage(`Merge failed: ${result.error.conflicted_files?.length ?? 0} conflicts detected`)
        } else {
          setErrorMessage(result.error.message || 'Merge failed')
        }
        refetch() // 刷新以获取最新状态
      }
    } catch (err) {
      const error = err as { message?: string; error?: GitOperationError }
      if (isConflictError(error.error)) {
        setErrorMessage(`Conflict detected: ${error.error.conflicted_files?.join(', ')}`)
      } else {
        setErrorMessage(error.message || 'Merge failed')
      }
      refetch()
    }
  }

  const handlePush = async () => {
    if (!worktreePath || !currentBranch) return

    if (mode === 'direct' && !hasMergedToTarget) {
      setErrorMessage(txt('Merge 到目标分支后才可以 Push', 'Please merge to target branch before pushing'))
      return
    }
    
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const pushBranch = mode === 'direct' ? `${currentBranch}:${targetBranch}` : currentBranch
      const result = await pushMutation.mutateAsync({
        worktreePath,
        remote: 'origin',
        branch: pushBranch,
      })

      if (result.success) {
        setSuccessMessage(mode === 'direct' ? `Pushed ${currentBranch} to ${targetBranch}` : `Pushed successfully to ${pushBranch}`)
        if (mode === 'direct') {
          onDirectPushSuccess?.()
        } else {
          setHasPushedInPrMode(true)
        }
        refetch()
      } else {
        setErrorMessage(result.message || 'Push failed')
        refetch()
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Push failed')
      refetch()
    }
  }

  const handleRebase = async () => {
    if (!worktreePath || !targetBranch) return
    
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await rebaseMutation.mutateAsync({
        worktreePath,
        targetBranch,
      })

      if (result.success) {
        setSuccessMessage(`Rebased onto ${targetBranch}`)
        refetch()
      } else if (result.error) {
        if (result.error.type === 'merge_conflicts') {
          setErrorMessage(`Rebase failed: ${result.error.conflicted_files?.length ?? 0} conflicts`)
        } else if (result.error.type === 'rebase_in_progress') {
          setErrorMessage('A rebase is already in progress')
        } else {
          setErrorMessage(result.error.message || 'Rebase failed')
        }
        refetch()
      }
    } catch (err) {
      const error = err as { message?: string; error?: GitOperationError }
      if (isConflictError(error.error)) {
        setErrorMessage(`Conflict detected: ${error.error.conflicted_files?.join(', ')}`)
      } else {
        setErrorMessage(error.message || 'Rebase failed')
      }
      refetch()
    }
  }

  const handleCreatePR = async () => {
    if (!worktreePath || !currentBranch) return
    if (!hasPushedInPrMode) {
      setErrorMessage(txt('请先 Push 当前工作分支，再创建 PR', 'Please push the current working branch before creating PR'))
      return
    }
    
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const pr = await createPullRequest(
        worktreePath,
        `PR: ${currentBranch} -> ${targetBranch}`,
        undefined,
        targetBranch,
        currentBranch
      )

      if (!pr?.url) {
        setErrorMessage('Create PR failed')
        return
      }

      setSuccessMessage(`PR created: ${pr.url}`)
      onPRCreated?.(pr.url)
      refetch()
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to create PR')
      refetch()
    }
  }

  const isPending = mergeMutation.isPending || pushMutation.isPending || rebaseMutation.isPending

  const canCommit = !isPending && hasUncommittedChanges && !isBlockedByConflict
  const canMerge = mode === 'direct' && !isPending && !isBlockedByConflict && !hasUncommittedChanges && commitsAhead > 0
  const canPushDirect = mode === 'direct' && !isPending && !isBlockedByConflict && hasMergedToTarget
  const canPushPr = mode === 'pr' && !isPending && !isBlockedByConflict && !hasUncommittedChanges && commitsAhead > 0
  const canPush = canPushDirect || canPushPr
  const canCreatePR = mode === 'pr' && !isPending && !isBlockedByConflict && hasPushedInPrMode
  const canRebase = !isPending && !isMergeInProgress

  const handleCommit = () => {
    if (!worktreePath || !canCommit) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsCommitDialogOpen(true)
  }

  const handleCommitSuccess = () => {
    setSuccessMessage('Committed successfully')
    setHasMergedToTarget(false)
    setHasPushedInPrMode(false)
    refetch()
  }

  return (
    <div className="space-y-4 text-gray-900 dark:text-gray-100">
      {/* 状态信息 */}
      <div className="bg-gray-50 rounded-lg p-3 text-sm dark:bg-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-4 h-4" />
          <span className="font-mono">{branchName || status?.current_branch}</span>
          <span className="text-gray-400 dark:text-gray-500">→</span>
          <span className="font-mono">{targetBranch}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
          {commitsAhead > 0 && <span className="text-green-600">+{commitsAhead} ahead</span>}
          {commitsBehind > 0 && <span className="text-orange-600">-{commitsBehind} behind</span>}
          {hasConflicts && (
            <span className="text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {status?.conflicted_files?.length ?? 0} conflicts
            </span>
          )}
          {isRebaseInProgress && (
            <span className="text-yellow-600 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />Rebasing...
            </span>
          )}
          {isMergeInProgress && <span className="text-yellow-600">Merging...</span>}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm dark:bg-red-950/30 dark:text-red-300">
          {(error as Error).message || 'Failed to load git branch status'}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('direct')}
          className={`px-3 py-1.5 text-xs font-medium rounded ${mode === 'direct' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
        >
          {txt('直推模式', 'Direct mode')}
        </button>
        <button
          type="button"
          onClick={() => setMode('pr')}
          className={`px-3 py-1.5 text-xs font-medium rounded ${mode === 'pr' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
        >
          {txt('PR 模式', 'PR mode')}
        </button>
      </div>

      {/* 消息提示 */}
      {errorMessage && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-start gap-2 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 操作按钮 - 按工作流程 */}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleCommit} disabled={!canCommit}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${canCommit ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}>
          <GitCommit className="w-4 h-4" />
          Commit
        </button>
        {mode === 'direct' && (
          <>
            <button onClick={handleMerge} disabled={!canMerge}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${canMerge ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}>
              <GitBranch className="w-4 h-4" />
              {mergeMutation.isPending ? 'Merging...' : `Merge ← ${targetBranch}`}
            </button>
            <button onClick={handlePush} disabled={!canPush}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${canPush ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}>
              <GitBranch className="w-4 h-4" />
              {pushMutation.isPending ? 'Pushing...' : `Push → ${targetBranch}`}
            </button>
          </>
        )}
        {mode === 'pr' && (
          <>
            <button onClick={handlePush} disabled={!canPush}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${canPush ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}>
              <GitBranch className="w-4 h-4" />
              {pushMutation.isPending ? 'Pushing...' : `Push → ${currentBranch}`}
            </button>
            <button onClick={handleCreatePR} disabled={!canCreatePR}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${canCreatePR ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}>
              <GitPullRequest className="w-4 h-4" />
              Create PR
            </button>
          </>
        )}
        <button onClick={handleRebase} disabled={!canRebase}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${canRebase ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}>
          <RefreshCw className={`w-4 h-4 ${rebaseMutation.isPending ? 'animate-spin' : ''}`} />
          {rebaseMutation.isPending ? 'Rebasing...' : 'Rebase'}
        </button>
        <button onClick={() => refetch()} disabled={isLoading}
          className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 冲突文件列表 */}
      {hasConflicts && status?.conflicted_files && status.conflicted_files.length > 0 && (
        <div className="p-3 bg-red-50 rounded-lg dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-700 mb-2 dark:text-red-300">
            Conflicts ({status.conflicted_files.length}):
          </p>
          <ul className="text-xs text-red-600 font-mono space-y-1 dark:text-red-300">
            {status.conflicted_files.slice(0, 5).map((file) => (
              <li key={file}>• {file}</li>
            ))}
            {status.conflicted_files.length > 5 && (
              <li>...and {status.conflicted_files.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
      <CommitDialog
        isOpen={isCommitDialogOpen}
        onClose={() => setIsCommitDialogOpen(false)}
        worktreePath={worktreePath}
        onSuccess={handleCommitSuccess}
      />
    </div>
  )
}
