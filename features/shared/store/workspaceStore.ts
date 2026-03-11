import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

// ==================== Types ====================

export type WorkspaceStatus =
  | 'initializing'
  | 'ready'
  | 'running'
  | 'error'
  | 'terminated'

export interface Workspace {
  id: string
  taskId: string
  path: string
  branch: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
  error?: string
  processId?: string
  output?: string
}

export interface WorkspaceStats {
  totalWorkspaces: number
  activeWorkspaces: number
  errorWorkspaces: number
}

// ==================== Selectors ====================

export const workspaceSelectors = {
  selectWorkspaces: (state: WorkspaceState) => state.workspaces,
  selectActiveWorkspace: (state: WorkspaceState) =>
    state.workspaces.find((w) => w.status === 'running'),
  selectWorkspaceById: (id: string) => (state: WorkspaceState) =>
    state.workspaces.find((w) => w.id === id),
  selectWorkspaceByTaskId: (taskId: string) => (state: WorkspaceState) =>
    state.workspaces.find((w) => w.taskId === taskId),
  selectIsLoading: (state: WorkspaceState) => state.isLoading,
  selectError: (state: WorkspaceState) => state.error,
  selectStats: (state: WorkspaceState) => ({
    totalWorkspaces: state.workspaces.length,
    activeWorkspaces: state.workspaces.filter((w) => w.status === 'running')
      .length,
    errorWorkspaces: state.workspaces.filter((w) => w.status === 'error').length,
  }),
}

// ==================== State Interface ====================

interface WorkspaceState {
  // State
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  isLoading: boolean
  error: string | null

  // Actions
  createWorkspace: (taskId: string, branch?: string) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  updateWorkspaceStatus: (
    id: string,
    status: WorkspaceStatus,
    error?: string
  ) => void
  setWorkspaceOutput: (id: string, output: string) => void
  setCurrentWorkspace: (workspace: Workspace | null) => void
  clearError: () => void
}

// ==================== Store Implementation ====================

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    (set, get) => ({
      // Initial State
      workspaces: [],
      currentWorkspace: null,
      isLoading: false,
      error: null,

      // Actions
      createWorkspace: async (taskId: string, branch?: string) => {
        set({ isLoading: true, error: null }, false, 'createWorkspace/pending')
        try {
          const response = await fetch(resolveHttpUrl('/api/workspaces'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, branch }),
          })
          if (!response.ok) throw new Error('Failed to create workspace')
          const workspace = await response.json()
          set(
            (state) => ({
              workspaces: [...state.workspaces, workspace],
              currentWorkspace: workspace,
              isLoading: false,
            }),
            false,
            'createWorkspace/fulfilled'
          )
          return workspace
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          set({ error: message, isLoading: false }, false, 'createWorkspace/rejected')
          throw error
        }
      },

      deleteWorkspace: async (id: string) => {
        set({ isLoading: true, error: null }, false, 'deleteWorkspace/pending')
        try {
          const response = await fetch(resolveHttpUrl(`/api/workspaces/${id}`), {
            method: 'DELETE',
          })
          if (!response.ok) throw new Error('Failed to delete workspace')
          set(
            (state) => ({
              workspaces: state.workspaces.filter((w) => w.id !== id),
              currentWorkspace:
                state.currentWorkspace?.id === id
                  ? null
                  : state.currentWorkspace,
              isLoading: false,
            }),
            false,
            'deleteWorkspace/fulfilled'
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          set({ error: message, isLoading: false }, false, 'deleteWorkspace/rejected')
          throw error
        }
      },

      updateWorkspaceStatus: (id: string, status: WorkspaceStatus, error?: string) => {
        set(
          (state) => ({
            workspaces: state.workspaces.map((w) =>
              w.id === id
                ? {
                    ...w,
                    status,
                    error,
                    updatedAt: new Date().toISOString(),
                  }
                : w
            ),
            currentWorkspace:
              state.currentWorkspace?.id === id
                ? {
                    ...state.currentWorkspace,
                    status,
                    error,
                    updatedAt: new Date().toISOString(),
                  }
                : state.currentWorkspace,
          }),
          false,
          'updateWorkspaceStatus'
        )
      },

      setWorkspaceOutput: (id: string, output: string) => {
        set(
          (state) => ({
            workspaces: state.workspaces.map((w) =>
              w.id === id ? { ...w, output, updatedAt: new Date().toISOString() } : w
            ),
            currentWorkspace:
              state.currentWorkspace?.id === id
                ? { ...state.currentWorkspace, output, updatedAt: new Date().toISOString() }
                : state.currentWorkspace,
          }),
          false,
          'setWorkspaceOutput'
        )
      },

      setCurrentWorkspace: (workspace: Workspace | null) => {
        set({ currentWorkspace: workspace }, false, 'setCurrentWorkspace')
      },

      clearError: () => {
        set({ error: null }, false, 'clearError')
      },
    }),
    { name: 'WorkspaceStore' }
  )
)
