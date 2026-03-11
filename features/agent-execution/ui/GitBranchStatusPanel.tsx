'use client'

import { GitBranch, ArrowRight, AlertTriangle, RefreshCw, CheckCircle, GitMerge } from 'lucide-react'
import { useGitBranchStatus } from '../hooks'

interface GitBranchStatusPanelProps {
  worktreePath: string
  targetBranch: string
  branchName?: string  // 用户选择的工作分支
}

export function GitBranchStatusPanel({ worktreePath, targetBranch, branchName }: GitBranchStatusPanelProps) {
  const { data: status, isLoading, error, refetch } = useGitBranchStatus(worktreePath, targetBranch)

  if (!worktreePath) {
    return (
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <p className="text-sm text-gray-400 dark:text-gray-500">No workspace available</p>
      </div>
    )
  }

  if (isLoading && !status) {
    return (
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 dark:bg-gray-800 dark:border-gray-700">
        <RefreshCw className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-500" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading branch status...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-red-50 border-b border-gray-200 dark:bg-red-950/30 dark:border-gray-700">
        <p className="text-sm text-red-600 dark:text-red-300">{error.message}</p>
        <button 
          onClick={() => refetch()}
          className="text-xs text-red-700 underline mt-1 dark:text-red-300"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!status) return null

  // 判断状态
  const conflictedFiles = Array.isArray(status.conflicted_files) ? status.conflicted_files : []
  const isUpToDate = status.commits_ahead === 0 && status.commits_behind === 0 && !status.has_uncommitted_changes
  const hasConflicts = conflictedFiles.length > 0
  const isRebasing = status.is_rebase_in_progress
  const isMerging = status.is_merge_in_progress

  return (
    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      {/* 分支信息 */}
      <div className="flex items-center gap-2 text-sm">
        {/* Task Branch - 优先使用传入的 branchName，否则使用 API 返回的 current_branch */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-md dark:bg-blue-950/30 dark:text-blue-300">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="font-mono font-medium">{branchName || status.current_branch}</span>
        </div>

        {/* 箭头 */}
        <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />

        {/* Target Branch */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-700 rounded-md dark:bg-gray-700 dark:text-gray-200">
          <span className="font-mono font-medium">{targetBranch}</span>
        </div>
      </div>

      {/* 状态标签 */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Commits Ahead */}
        {status.commits_ahead > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
            <ArrowRight className="w-3 h-3 rotate-45" />
            +{status.commits_ahead} ahead
          </span>
        )}

        {/* Commits Behind */}
        {status.commits_behind > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
            <ArrowRight className="w-3 h-3 -rotate-45" />
            -{status.commits_behind} behind
          </span>
        )}

        {/* Uncommitted Changes */}
        {status.has_uncommitted_changes && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">
            <AlertTriangle className="w-3 h-3" />
            Uncommitted
          </span>
        )}

        {/* Conflicts */}
        {hasConflicts && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {conflictedFiles.length} conflict(s)
          </span>
        )}

        {/* Rebasing */}
        {isRebasing && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {status.conflict_op === 'rebase' ? 'Rebasing...' : 'Conflict in progress'}
          </span>
        )}

        {/* Merging */}
        {isMerging && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">
            <GitMerge className="w-3 h-3 animate-spin" />
            {status.conflict_op === 'merge' ? 'Merging...' : 'Conflict in progress'}
          </span>
        )}

        {/* Up to date */}
        {isUpToDate && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full dark:bg-gray-700 dark:text-gray-300">
            <CheckCircle className="w-3 h-3" />
            Up to date
          </span>
        )}
      </div>
    </div>
  )
}
