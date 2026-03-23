import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TaskPanel, { type WorkspaceInfo, type TaskActivityLogInfo } from '@/features/kanban/ui/TaskDetailPanel/TaskPanel'

describe('TaskPanel', () => {
  const confirmSpy = vi.spyOn(window, 'confirm')

  const baseTask = {
    id: 'task-1',
    title: 'Fix login redirect',
    description: 'Fix login redirect',
    status: 'pending',
    agentCli: 'OPENCODE',
    attemptCount: 2,
    lastAttemptSummary: 'Started a revision session in the active workspace',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as const

  const workspaces: WorkspaceInfo[] = [
    {
      id: 'ws-primary',
      taskId: 'task-1',
      branch: 'feature/login',
      role: 'primary',
      sourceWorkspaceId: null,
      agentWorkingDir: '/tmp/ws-primary',
      archived: false,
      pinned: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      status: 'completed',
    },
  ]

  const activityLogs: TaskActivityLogInfo[] = [
    {
      id: 'log-1',
      taskId: 'task-1',
      workspaceId: 'ws-primary',
      sessionId: 'sess-1',
      eventType: 'session_started',
      summary: 'Started a new session',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'log-2',
      taskId: 'task-1',
      workspaceId: 'ws-primary',
      sessionId: 'sess-2',
      eventType: 'revision_session_started',
      summary: 'Started a revision session',
      metadata: 'continuation=retry',
      createdAt: '2024-01-01T01:00:00.000Z',
    },
  ]

  beforeEach(() => {
    confirmSpy.mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockReset()
  })

  it('renders workspace role, source and revision count', () => {
    render(
      <TaskPanel
        task={baseTask as never}
        workspaces={[{
          ...workspaces[0],
          role: 'fork',
          sourceWorkspaceId: 'ws-root',
        }]}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
      />
    )

    expect(screen.getByText('分叉')).toBeInTheDocument()
    expect(screen.getByText(/来源: ws-root/)).toBeInTheDocument()
    expect(screen.getByText(/修订: 1/)).toBeInTheDocument()
  })

  it('renders attempt count and last attempt summary', () => {
    render(
      <TaskPanel
        task={baseTask as never}
        workspaces={workspaces}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
      />
    )

    expect(screen.getByText('尝试次数: 2')).toBeInTheDocument()
    expect(screen.getByText(/最近尝试: Started a revision session in the active workspace/)).toBeInTheDocument()
  })

  it('shows resume button for pending task and calls handler', async () => {
    const onResumeWorkspace = vi.fn()
    render(
      <TaskPanel
        task={baseTask as never}
        workspaces={workspaces}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
        onResumeWorkspace={onResumeWorkspace}
      />
    )

    const button = screen.getByRole('button', { name: '继续在当前 Worktree 修订' })
    expect(button).toBeInTheDocument()
    button.click()
    expect(onResumeWorkspace).toHaveBeenCalledWith('ws-primary')
  })

  it('shows retry workspace button for pending task and calls handler', () => {
    const onCreateRetryWorkspace = vi.fn()
    render(
      <TaskPanel
        task={baseTask as never}
        workspaces={workspaces}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
        onCreateRetryWorkspace={onCreateRetryWorkspace}
      />
    )

    const button = screen.getByRole('button', { name: '新建 Retry Worktree' })
    expect(button).toBeInTheDocument()
    button.click()
    expect(onCreateRetryWorkspace).toHaveBeenCalledWith('ws-primary')
  })

  it('only shows cleanup button when task is done or cancelled', () => {
    const { rerender } = render(
      <TaskPanel
        task={baseTask as never}
        workspaces={workspaces}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
      />
    )

    expect(screen.queryByTitle('删除 Worktree')).not.toBeInTheDocument()

    rerender(
      <TaskPanel
        task={{ ...baseTask, status: 'done' } as never}
        workspaces={workspaces}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
      />
    )

    expect(screen.getByTitle('删除 Worktree')).toBeInTheDocument()
  })

  it('shows archived badge and hides cleanup button for archived workspace', () => {
    render(
      <TaskPanel
        task={{ ...baseTask, status: 'done' } as never}
        workspaces={[{
          ...workspaces[0],
          archived: true,
        }]}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /展开/i }))
    expect(screen.getByText('已归档')).toBeInTheDocument()
    expect(screen.queryByTitle('删除 Worktree')).not.toBeInTheDocument()
  })

  it('separates active and archived workspaces into different sections', () => {
    render(
      <TaskPanel
        task={{ ...baseTask, status: 'done' } as never}
        workspaces={[
          workspaces[0],
          {
            ...workspaces[0],
            id: 'ws-archived',
            branch: 'feature/login-old',
            archived: true,
          },
        ]}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
      />
    )

    expect(screen.getByText('Worktrees')).toBeInTheDocument()
    expect(screen.getByText('已归档历史 (1)')).toBeInTheDocument()
    expect(screen.queryByText('feature/login-old')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /展开/i }))

    expect(screen.getAllByText('已归档')).toHaveLength(1)
    expect(screen.getByText('feature/login-old')).toBeInTheDocument()
  })

  it('shows bulk cleanup button for terminal tasks and archives all active workspaces', () => {
    const onDeleteAllWorkspaces = vi.fn()

    render(
      <TaskPanel
        task={{ ...baseTask, status: 'done' } as never}
        workspaces={[
          workspaces[0],
          {
            ...workspaces[0],
            id: 'ws-retry',
            branch: 'feature/login-retry',
            role: 'retry',
          },
        ]}
        activityLogs={activityLogs}
        selectedWorkspaceId="ws-primary"
        onDeleteAllWorkspaces={onDeleteAllWorkspaces}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '归档全部 Worktrees' }))
    expect(onDeleteAllWorkspaces).toHaveBeenCalledWith(['ws-primary', 'ws-retry'])
  })
})
