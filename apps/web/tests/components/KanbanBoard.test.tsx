import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import zhCNMessages from '@/messages/zh-CN.json'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'

const projectState = {
  projects: [
    {
      id: 'project-1',
      name: 'Demo Project',
      repoPath: '/tmp/project',
      targetBranch: 'main',
    },
  ],
  currentProject: {
    id: 'project-1',
    name: 'Demo Project',
    repoPath: '/tmp/project',
    targetBranch: 'main',
  },
  fetchProjects: vi.fn(),
  fetchProjectById: vi.fn().mockImplementation(async () => projectState.currentProject),
  setCurrentProject: vi.fn(),
}

const taskState = {
  tasks: [
    {
      id: 'task-1',
      projectId: 'project-1',
      title: 'Fix login redirect',
      description: 'Fix login redirect',
      status: 'todo',
      agentCli: 'OPENCODE',
      activeWorkspaceId: undefined,
      activeSessionId: undefined,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  fetchTasks: vi.fn(),
  createTask: vi.fn().mockResolvedValue(undefined),
  moveTask: vi.fn().mockResolvedValue(undefined),
  updateTask: vi.fn().mockResolvedValue(undefined),
}

const uiState = {
  locale: 'zh-CN',
  themeMode: 'system',
  setLocale: vi.fn(),
  setThemeMode: vi.fn(),
}

const taskExecutionState = {
  workspace: null,
  sessionId: null,
  isInitialized: true,
  isStarting: false,
  isExecuting: false,
  isConnected: false,
  executionProcesses: [],
  entries: [],
  error: null,
  sendMessage: vi.fn(),
  stopExecution: vi.fn(),
  restartExecution: vi.fn(),
  prepareNewSessionInWorkspace: vi.fn(),
  startExecution: vi.fn(),
}

const taskPanelSpy = vi.fn()

vi.mock('@/features/shared/store', () => ({
  useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState),
  useTaskStore: (selector: (state: typeof taskState) => unknown) => selector(taskState),
  useUIStore: (selector: (state: typeof uiState) => unknown) => selector(uiState),
}))

vi.mock('@/features/agent-execution/hooks', () => ({
  useTaskExecutionV2: () => taskExecutionState,
}))

vi.mock('@/features/agent-execution/hooks/useExecutorDiscovery', () => ({
  useExecutorDiscovery: () => ({
    agents: [{ id: 'sisyphus', name: 'Sisyphus' }],
    models: [{ id: 'gpt-4.1', provider: 'openai', name: 'GPT-4.1' }],
    defaultModel: 'openai/gpt-4.1',
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useMobile: () => false,
}))

vi.mock('@/components/kanban/KanbanColumn', () => ({
  KanbanColumn: ({
    tasks,
    onTaskClick,
  }: {
    tasks: Array<{ id: string; title: string | null; description: string }>
    onTaskClick?: (task: { id: string; title: string | null; description: string }) => void
  }) => (
    <div>
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onTaskClick?.(task)}
        >
          {task.title || task.description}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/features/kanban/ui/TaskDetailLayout', () => ({
  default: ({ header, taskPanel, attemptPanel }: { header: ReactElement; taskPanel: ReactElement; attemptPanel: ReactElement }) => (
    <div>
      <div data-testid="task-detail-header">{header}</div>
      <div data-testid="task-detail-panel">{taskPanel}</div>
      <div data-testid="attempt-panel">{attemptPanel}</div>
    </div>
  ),
}))

vi.mock('@/features/kanban/ui/TaskDetailPanel/TaskPanel', async () => {
  const actual = await vi.importActual<typeof import('@/features/kanban/ui/TaskDetailPanel/TaskPanel')>(
    '@/features/kanban/ui/TaskDetailPanel/TaskPanel'
  )

  return {
    ...actual,
    default: (props: Record<string, unknown>) => {
      taskPanelSpy(props)
      const selectedWorkspaceId = typeof props.selectedWorkspaceId === 'string' ? props.selectedWorkspaceId : ''
      const onDeleteWorkspace = typeof props.onDeleteWorkspace === 'function'
        ? props.onDeleteWorkspace as (workspaceId: string) => void
        : undefined
      const onCreateRetryWorkspace = typeof props.onCreateRetryWorkspace === 'function'
        ? props.onCreateRetryWorkspace as (workspaceId: string) => void
        : undefined
      const onDeleteAllWorkspaces = typeof props.onDeleteAllWorkspaces === 'function'
        ? props.onDeleteAllWorkspaces as (workspaceIds: string[]) => void
        : undefined
      const workspaces = Array.isArray(props.workspaces) ? props.workspaces as Array<{ id: string; archived?: boolean }> : []
      return (
        <div>
          <div data-testid="selected-workspace-id">{selectedWorkspaceId}</div>
          <div data-testid="workspace-count">{String(workspaces.length)}</div>
          <button
            type="button"
            onClick={() => {
              if (selectedWorkspaceId && onDeleteWorkspace) {
                void onDeleteWorkspace(selectedWorkspaceId)
              }
            }}
          >
            cleanup-selected-workspace
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedWorkspaceId && onCreateRetryWorkspace) {
                void onCreateRetryWorkspace(selectedWorkspaceId)
              }
            }}
          >
            create-retry-workspace
          </button>
          <button
            type="button"
            onClick={() => {
              if (onDeleteAllWorkspaces) {
                void onDeleteAllWorkspaces(workspaces.filter((workspace) => !workspace.archived).map((workspace) => workspace.id))
              }
            }}
          >
            cleanup-all-workspaces
          </button>
        </div>
      )
    },
  }
})

vi.mock('@/features/agent-execution/ui', () => ({
  WysiwygFollowUpInput: () => <div data-testid="follow-up-input" />,
  ConversationHistoryEntries: () => <div data-testid="conversation-history" />,
  GitPanel: () => <div data-testid="git-panel" />,
  WorktreeFilePreviewPane: () => <div data-testid="file-preview" />,
}))

const makeJsonResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response)

describe('KanbanBoard Component', () => {
  const originalFetch = global.fetch

  const renderWithIntl = (ui: ReactElement) =>
    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhCNMessages}>
        {ui}
      </NextIntlClientProvider>
    )

  const clickTaskCard = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Fix login redirect' }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    taskPanelSpy.mockClear()
    taskState.tasks = [
      {
        id: 'task-1',
        projectId: 'project-1',
        title: 'Fix login redirect',
        description: 'Fix login redirect',
        status: 'todo',
        agentCli: 'OPENCODE',
        activeWorkspaceId: undefined,
        activeSessionId: undefined,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders kanban board container', () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/swarm-bindings')) return makeJsonResponse([])
      return makeJsonResponse([])
    })

    renderWithIntl(<KanbanBoard projectId="project-1" />)
    expect(screen.getByRole('button', { name: 'Fix login redirect' })).toBeInTheDocument()
    expect(screen.getByTestId('follow-up-input')).toBeInTheDocument()
  })

  it('restores active workspace when activeWorkspaceId points to a live workspace', async () => {
    taskState.tasks = [
      {
        ...taskState.tasks[0],
        activeWorkspaceId: 'ws-live',
      },
    ]

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/swarm-bindings')) return makeJsonResponse([])
      if (url.includes('/api/tasks/task-1/workspaces')) {
        return makeJsonResponse([
          {
            id: 'ws-archived',
            taskId: 'task-1',
            branch: 'feature/old',
            archived: true,
            pinned: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'ws-live',
            taskId: 'task-1',
            branch: 'feature/current',
            archived: false,
            pinned: false,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        ])
      }
      if (url.includes('/api/tasks/task-1/activity-logs')) return makeJsonResponse([])
      if (url.includes('/api/workspaces/ws-live')) {
        return makeJsonResponse({
          id: 'ws-live',
          branch: 'feature/current',
          agentWorkingDir: '/tmp/ws-live',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        })
      }
      return makeJsonResponse([])
    })

    renderWithIntl(<KanbanBoard projectId="project-1" />)
    clickTaskCard()

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('ws-live')
    })
  })

  it('falls back to first live workspace when activeWorkspaceId points to archived history', async () => {
    taskState.tasks = [
      {
        ...taskState.tasks[0],
        activeWorkspaceId: 'ws-archived',
      },
    ]

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/swarm-bindings')) return makeJsonResponse([])
      if (url.includes('/api/tasks/task-1/workspaces')) {
        return makeJsonResponse([
          {
            id: 'ws-archived',
            taskId: 'task-1',
            branch: 'feature/old',
            archived: true,
            pinned: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'ws-live',
            taskId: 'task-1',
            branch: 'feature/current',
            archived: false,
            pinned: false,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        ])
      }
      if (url.includes('/api/tasks/task-1/activity-logs')) return makeJsonResponse([])
      if (url.includes('/api/workspaces/ws-live')) {
        return makeJsonResponse({
          id: 'ws-live',
          branch: 'feature/current',
          agentWorkingDir: '/tmp/ws-live',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        })
      }
      return makeJsonResponse([])
    })

    renderWithIntl(<KanbanBoard projectId="project-1" />)
    clickTaskCard()

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('ws-live')
    })
  })

  it('switches to the next live workspace after cleaning up the selected workspace', async () => {
    taskState.tasks = [
      {
        ...taskState.tasks[0],
        status: 'done',
        activeWorkspaceId: 'ws-primary',
      },
    ]

    let workspaceDeleted = false

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/swarm-bindings')) return makeJsonResponse([])
      if (url.includes('/api/tasks/task-1/activity-logs')) return makeJsonResponse([])

      if (url.includes('/api/tasks/task-1/workspaces') && init?.method !== 'DELETE') {
        return makeJsonResponse([
          {
            id: 'ws-primary',
            taskId: 'task-1',
            branch: 'feature/primary',
            archived: workspaceDeleted,
            pinned: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'ws-fork',
            taskId: 'task-1',
            branch: 'feature/fork',
            archived: false,
            pinned: false,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        ])
      }

      if (url.includes('/api/workspaces/ws-primary') && init?.method === 'DELETE') {
        workspaceDeleted = true
        return makeJsonResponse({ ok: true })
      }

      if (url.includes('/api/workspaces/ws-primary')) {
        return makeJsonResponse({
          id: 'ws-primary',
          branch: 'feature/primary',
          agentWorkingDir: '/tmp/ws-primary',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      }

      if (url.includes('/api/workspaces/ws-fork')) {
        return makeJsonResponse({
          id: 'ws-fork',
          branch: 'feature/fork',
          agentWorkingDir: '/tmp/ws-fork',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        })
      }

      return makeJsonResponse([])
    })

    renderWithIntl(<KanbanBoard projectId="project-1" />)
    clickTaskCard()

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('ws-primary')
    })

    fireEvent.click(screen.getByRole('button', { name: 'cleanup-selected-workspace' }))

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('ws-fork')
    })
  })

  it('creates a retry workspace from the selected live workspace', async () => {
    taskState.tasks = [
      {
        ...taskState.tasks[0],
        status: 'pending',
        activeWorkspaceId: 'ws-primary',
      },
    ]

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/swarm-bindings')) {
        return makeJsonResponse([{
          swarm: { cli: 'OPENCODE' },
        }])
      }
      if (url.includes('/api/tasks/task-1/workspaces')) {
        return makeJsonResponse([
          {
            id: 'ws-primary',
            taskId: 'task-1',
            branch: 'feature/primary',
            archived: false,
            pinned: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ])
      }
      if (url.includes('/api/tasks/task-1/activity-logs')) return makeJsonResponse([])
      if (url.includes('/api/workspaces/ws-primary')) {
        return makeJsonResponse({
          id: 'ws-primary',
          branch: 'feature/primary',
          agentWorkingDir: '/tmp/ws-primary',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      }
      return makeJsonResponse([])
    })

    renderWithIntl(<KanbanBoard projectId="project-1" />)
    clickTaskCard()

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('ws-primary')
    })

    fireEvent.click(screen.getByRole('button', { name: 'create-retry-workspace' }))

    await waitFor(() => {
      expect(taskExecutionState.restartExecution).toHaveBeenCalled()
      expect(taskExecutionState.sendMessage).toHaveBeenCalledWith('Fix login redirect', null, undefined, undefined)
    })
  })

  it('clears selected workspace after bulk cleanup when no live workspace remains', async () => {
    taskState.tasks = [
      {
        ...taskState.tasks[0],
        status: 'done',
        activeWorkspaceId: 'ws-primary',
      },
    ]

    let deletedWorkspaceIds: string[] = []

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/swarm-bindings')) return makeJsonResponse([])
      if (url.includes('/api/tasks/task-1/activity-logs')) return makeJsonResponse([])

      if (url.includes('/api/tasks/task-1/workspaces') && init?.method !== 'DELETE') {
        return makeJsonResponse([
          {
            id: 'ws-primary',
            taskId: 'task-1',
            branch: 'feature/primary',
            archived: deletedWorkspaceIds.includes('ws-primary'),
            pinned: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'ws-retry',
            taskId: 'task-1',
            branch: 'feature/retry',
            archived: deletedWorkspaceIds.includes('ws-retry'),
            pinned: false,
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        ])
      }

      if (url.includes('/api/workspaces/') && init?.method === 'DELETE') {
        const workspaceId = url.split('/api/workspaces/')[1]
        deletedWorkspaceIds = [...deletedWorkspaceIds, workspaceId]
        return makeJsonResponse({ ok: true })
      }

      if (url.includes('/api/workspaces/ws-primary')) {
        return makeJsonResponse({
          id: 'ws-primary',
          branch: 'feature/primary',
          agentWorkingDir: '/tmp/ws-primary',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      }

      return makeJsonResponse([])
    })

    renderWithIntl(<KanbanBoard projectId="project-1" />)
    clickTaskCard()

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('ws-primary')
    })

    fireEvent.click(screen.getByRole('button', { name: 'cleanup-all-workspaces' }))

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-id')).toHaveTextContent('')
    })
  })
})
