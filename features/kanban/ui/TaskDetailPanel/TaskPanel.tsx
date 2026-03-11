// features/kanban/ui/TaskDetailPanel/TaskPanel.tsx
import React, { useState } from 'react'
import { CheckCircle, Loader2, MinusCircle, Plus, XCircle, Trash2, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatusColors, Task } from '@/features/kanban/ui'
import { CreateWorktreeModal, CreateWorktreeTexts } from './CreateWorktreeModal'

export type AttemptStatus = 'running' | 'completed' | 'failed' | 'killed'

// Workspace 类型 - 与数据库 schema 对应
export interface WorkspaceInfo {
  id: string
  taskId: string
  branch: string
  agentWorkingDir: string | null
  archived: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  // 运行时状态
  status?: AttemptStatus
}

interface TaskPanelProps {
  task: Task
  workspaces: WorkspaceInfo[]
  selectedWorkspaceId?: string
  onSelectWorkspace?: (workspaceId: string) => void
  onCreateWorkspace?: (baseBranch: string) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  repoPath?: string
  locale?: string
  labels?: {
    taskInfo: string
    worktrees: string
    noWorktree: string
    workspaceNotConfigured: string
    deleteWorktree: string
    deleteWorktreeConfirm: string
    createWorktree: string
    attemptStatus: Record<AttemptStatus, string>
    statusLabels: Record<Task['status'], string>
    createWorktreeModal: CreateWorktreeTexts
  }
}

const attemptStatusStyles: Record<AttemptStatus, { badge: string }> = {
  running: { badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30' },
  completed: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
  failed: { badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30' },
  killed: { badge: 'bg-muted text-muted-foreground border-border' },
}

const attemptStatusIcon: Record<AttemptStatus, React.ReactNode> = {
  running: <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />,
  completed: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  killed: <MinusCircle className="w-3.5 h-3.5 text-muted-foreground" />,
}

const TaskPanel: React.FC<TaskPanelProps> = ({
  task,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  repoPath,
  locale = 'zh-CN',
  labels = {
    taskInfo: '任务信息',
    worktrees: 'Worktrees',
    noWorktree: '暂无 Worktree',
    workspaceNotConfigured: '未设置工作目录',
    deleteWorktree: '删除 Worktree',
    deleteWorktreeConfirm: '确定要删除这个 Worktree 吗？此操作不可恢复。',
    createWorktree: '新建 Worktree',
    attemptStatus: {
      running: '执行中',
      completed: '已完成',
      failed: '失败',
      killed: '已停止',
    },
    statusLabels: {
      todo: '待办',
      inprogress: '进行中',
      pending: '待处理',
      done: '完成',
      cancelled: '取消',
    },
    createWorktreeModal: {
      createWorktree: '新建 Worktree',
      selectBaseBranchDescription: '选择基准分支，将从该分支创建新的 Worktree：',
      baseBranch: '基准分支',
      loadingBranches: '加载分支...',
      selectBranch: '选择分支',
      branchNotFound: '未找到分支',
      current: '当前',
      repoPathNotConfigured: '未配置仓库路径',
      cancel: '取消',
    },
  },
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const statusColors = getStatusColors(task.status)
  const statusLabel = labels.statusLabels[task.status]

  // 处理删除
  const handleDelete = async (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation()
    if (!confirm(labels.deleteWorktreeConfirm)) {
      return
    }
    setDeletingId(workspaceId)
    try {
      await onDeleteWorkspace?.(workspaceId)
    } finally {
      setDeletingId(null)
    }
  }

  // 处理创建
  const handleCreate = async (baseBranch: string) => {
    await onCreateWorkspace?.(baseBranch)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span className={cn('w-2 h-2 rounded-full', statusColors.dotColor)} />
            <span className="font-medium">{task.agentCli || 'OPENCODE'}</span>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
              statusColors.badgeBg,
              statusColors.badgeText
            )}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {labels.worktrees}
        </div>
        <div className="space-y-2">
          {workspaces.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {labels.noWorktree}
            </div>
          ) : (
            workspaces.map((ws, index) => {
              const isActive = ws.id === selectedWorkspaceId
              // 从 archived 字段推断状态
              const status: AttemptStatus = ws.status || (ws.archived ? 'killed' : 'completed')
              const style = attemptStatusStyles[status]

              return (
                <div
                  key={ws.id}
                  className={cn(
                    'w-full text-left rounded-lg border transition-colors group relative',
                    isActive
                      ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'
                      : 'border-border bg-card hover:border-ring/40'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace?.(ws.id)}
                    className="w-full text-left px-3 py-2.5 pr-10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                        )}
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="max-w-[140px] truncate text-xs font-mono text-foreground">
                            {ws.branch}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(ws.createdAt).toLocaleTimeString(locale, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="truncate text-xs text-muted-foreground">
                        {ws.agentWorkingDir || labels.workspaceNotConfigured}
                      </div>
                      <div className="flex items-center gap-1">
                        {attemptStatusIcon[status]}
                        <span
                          className={cn(
                            'text-[10px] font-semibold uppercase px-1.5 py-0.5 border rounded-full',
                            style.badge
                          )}
                        >
                          {labels.attemptStatus[status]}
                        </span>
                      </div>
                    </div>
                  </button>
                  {/* 删除按钮 - 放在外层容器中，避免嵌套 */}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, ws.id)}
                    disabled={deletingId === ws.id}
                    className={cn(
                      'absolute top-2.5 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300 transition-all',
                      deletingId === ws.id && 'opacity-50 cursor-not-allowed'
                    )}
                    title={labels.deleteWorktree}
                  >
                    {deletingId === ws.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring/40 hover:bg-muted"
        >
          <Plus className="w-4 h-4" />
          {labels.createWorktree}
        </button>
      </div>

      {/* 创建 Worktree 模态框 */}
      <CreateWorktreeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        repoPath={repoPath}
        texts={labels.createWorktreeModal}
      />
    </div>
  )
}

export default TaskPanel
