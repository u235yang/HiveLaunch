// features/kanban/ui/TaskDetailPanel/TaskPanel.tsx
import React, { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronRight, Loader2, MinusCircle, Plus, XCircle, Trash2, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatusColors, Task } from '@/features/kanban/ui'
import { CreateWorktreeModal, CreateWorktreeTexts } from './CreateWorktreeModal'

export type AttemptStatus = 'running' | 'completed' | 'failed' | 'killed'

// Workspace 类型 - 与数据库 schema 对应
export interface WorkspaceInfo {
  id: string
  taskId: string
  branch: string
  role?: 'primary' | 'retry' | 'fork'
  sourceWorkspaceId?: string | null
  agentWorkingDir: string | null
  archived: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  // 运行时状态
  status?: AttemptStatus
}

export interface TaskActivityLogInfo {
  id: string
  taskId: string
  workspaceId?: string
  sessionId?: string
  eventType: string
  summary: string
  metadata?: string | null
  createdAt: string
}

interface TaskPanelProps {
  task: Task
  workspaces: WorkspaceInfo[]
  activityLogs?: TaskActivityLogInfo[]
  selectedWorkspaceId?: string
  onSelectWorkspace?: (workspaceId: string) => void
  onCreateWorkspace?: (baseBranch: string) => void
  onCreateRetryWorkspace?: (workspaceId: string) => void
  onResumeWorkspace?: (workspaceId: string) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  onDeleteAllWorkspaces?: (workspaceIds: string[]) => void
  repoPath?: string
  locale?: string
  labels?: {
    taskInfo: string
    worktrees: string
    archivedWorktrees?: string
    noArchivedWorktrees?: string
    recentActivity?: string
    noRecentActivity?: string
    noWorktree: string
    workspaceRoles?: Record<'primary' | 'retry' | 'fork', string>
    workspaceSourcePrefix?: string
    workspaceRevisionPrefix?: string
    workspaceNotConfigured: string
    deleteWorktree: string
    deleteWorktreeConfirm: string
    deleteAllWorktrees?: string
    deleteAllWorktreesConfirm?: string
    archivedToggleShow?: string
    archivedToggleHide?: string
    createWorktree: string
    createRetryWorkspace?: string
    resumeWorkspace?: string
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
  activityLogs = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onCreateRetryWorkspace,
  onResumeWorkspace,
  onDeleteWorkspace,
  onDeleteAllWorkspaces,
  repoPath,
  locale = 'zh-CN',
  labels = {
    taskInfo: '任务信息',
    worktrees: 'Worktrees',
    archivedWorktrees: '已归档历史',
    noArchivedWorktrees: '暂无归档 Worktree',
    recentActivity: '最近活动',
    noRecentActivity: '暂无活动记录',
    noWorktree: '暂无 Worktree',
    workspaceRoles: {
      primary: '主线',
      retry: '重试',
      fork: '分叉',
    },
    workspaceSourcePrefix: '来源',
    workspaceRevisionPrefix: '修订',
    workspaceNotConfigured: '未设置工作目录',
    deleteWorktree: '删除 Worktree',
    deleteWorktreeConfirm: '确定要删除这个 Worktree 吗？此操作不可恢复。',
    deleteAllWorktrees: '归档全部 Worktrees',
    deleteAllWorktreesConfirm: '确定要归档当前卡片的全部 Worktree 吗？此操作会关闭相关会话。',
    archivedToggleShow: '展开',
    archivedToggleHide: '收起',
    createWorktree: '新建 Worktree',
    createRetryWorkspace: '新建 Retry Worktree',
    resumeWorkspace: '继续在当前 Worktree 修订',
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
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [showArchivedHistory, setShowArchivedHistory] = useState(false)

  const statusColors = getStatusColors(task.status)
  const statusLabel = labels.statusLabels[task.status]
  const canCleanupWorkspaces = task.status === 'done' || task.status === 'cancelled'
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)
  const activeWorkspaces = workspaces.filter((workspace) => !workspace.archived)
  const archivedWorkspaces = workspaces.filter((workspace) => workspace.archived)
  const getWorkspaceRevisionCount = (workspaceId: string): number => (
    activityLogs.filter((log) =>
      log.workspaceId === workspaceId && (
        log.eventType === 'session_started' || log.eventType === 'revision_session_started'
      )
    ).length
  )

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

  const handleDeleteAll = async () => {
    if (!canCleanupWorkspaces || activeWorkspaces.length === 0) return
    if (!confirm(labels.deleteAllWorktreesConfirm || 'Archive all worktrees?')) {
      return
    }
    setIsDeletingAll(true)
    try {
      await onDeleteAllWorkspaces?.(activeWorkspaces.map((workspace) => workspace.id))
    } finally {
      setIsDeletingAll(false)
    }
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
        {(typeof task.attemptCount === 'number' || task.lastAttemptSummary) ? (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            {typeof task.attemptCount === 'number' ? (
              <div>尝试次数: {task.attemptCount}</div>
            ) : null}
            {task.lastAttemptSummary ? (
              <div className="line-clamp-2">最近尝试: {task.lastAttemptSummary}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>{labels.worktrees}</span>
            {canCleanupWorkspaces && activeWorkspaces.length > 1 ? (
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="rounded border border-border px-2 py-1 text-[10px] font-medium normal-case tracking-normal text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingAll ? 'Archiving...' : (labels.deleteAllWorktrees || 'Archive all')}
              </button>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          {activeWorkspaces.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {labels.noWorktree}
            </div>
          ) : (
            activeWorkspaces.map((ws) => {
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
                          {ws.role ? (
                            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {labels.workspaceRoles?.[ws.role] || ws.role}
                            </span>
                          ) : null}
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
                      <div className="min-w-0">
                        <div className="truncate text-xs text-muted-foreground">
                          {ws.agentWorkingDir || labels.workspaceNotConfigured}
                        </div>
                        {ws.sourceWorkspaceId ? (
                          <div className="mt-1 truncate text-[10px] text-muted-foreground/80">
                            {labels.workspaceSourcePrefix || 'Source'}: {ws.sourceWorkspaceId}
                          </div>
                        ) : null}
                        {getWorkspaceRevisionCount(ws.id) > 1 ? (
                          <div className="mt-1 truncate text-[10px] text-muted-foreground/80">
                            {labels.workspaceRevisionPrefix || 'Revision'}: {getWorkspaceRevisionCount(ws.id) - 1}
                          </div>
                        ) : null}
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
                  {canCleanupWorkspaces ? (
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
                  ) : null}
                </div>
              )
            })
          )}
        </div>

        <div className="mt-6 mb-3 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span>{labels.archivedWorktrees || 'Archived Worktrees'} ({archivedWorkspaces.length})</span>
          <button
            type="button"
            onClick={() => setShowArchivedHistory((value) => !value)}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium normal-case tracking-normal text-foreground transition-colors hover:bg-muted"
          >
            {showArchivedHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showArchivedHistory
              ? (labels.archivedToggleHide || 'Hide')
              : (labels.archivedToggleShow || 'Show')}
          </button>
        </div>
        {showArchivedHistory ? (
          <div className="space-y-2">
            {archivedWorkspaces.length === 0 ? (
              <div className="py-3 text-sm text-muted-foreground">
                {labels.noArchivedWorktrees || 'No archived worktrees'}
              </div>
            ) : (
              archivedWorkspaces.map((ws) => {
              const isActive = ws.id === selectedWorkspaceId
              const status: AttemptStatus = ws.status || 'killed'
              const style = attemptStatusStyles[status]

              return (
                <div
                  key={ws.id}
                  className={cn(
                    'w-full text-left rounded-lg border transition-colors',
                    isActive
                      ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'
                      : 'border-border bg-card/70 hover:border-ring/40'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace?.(ws.id)}
                    className="w-full text-left px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isActive ? (
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                        ) : null}
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="max-w-[140px] truncate text-xs font-mono text-foreground">
                            {ws.branch}
                          </span>
                          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            已归档
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(ws.createdAt).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-muted-foreground">
                          {ws.agentWorkingDir || labels.workspaceNotConfigured}
                        </div>
                        {getWorkspaceRevisionCount(ws.id) > 1 ? (
                          <div className="mt-1 truncate text-[10px] text-muted-foreground/80">
                            {labels.workspaceRevisionPrefix || 'Revision'}: {getWorkspaceRevisionCount(ws.id) - 1}
                          </div>
                        ) : null}
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
                </div>
              )
              })
            )}
          </div>
        ) : null}

        <div className="mt-6 mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {labels.recentActivity || '最近活动'}
        </div>
        <div className="space-y-2">
          {activityLogs.length === 0 ? (
            <div className="py-3 text-sm text-muted-foreground">
              {labels.noRecentActivity || '暂无活动记录'}
            </div>
          ) : (
            activityLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-foreground">{log.summary}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(log.createdAt).toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                {log.metadata ? (
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {log.metadata}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="space-y-2">
          {task.status === 'pending' && selectedWorkspaceId && !selectedWorkspace?.archived ? (
            <>
              <button
                type="button"
                onClick={() => onResumeWorkspace?.(selectedWorkspaceId)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
              >
                {labels.resumeWorkspace || 'Resume in current workspace'}
              </button>
              <button
                type="button"
                onClick={() => onCreateRetryWorkspace?.(selectedWorkspaceId)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring/40 hover:bg-muted"
              >
                {labels.createRetryWorkspace || 'Create retry worktree'}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring/40 hover:bg-muted"
          >
            <Plus className="w-4 h-4" />
            {labels.createWorktree}
          </button>
        </div>
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
