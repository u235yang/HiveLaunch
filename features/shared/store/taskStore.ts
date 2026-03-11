import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import type { BaseCodingAgent } from '@shared/types'

// ==================== Types ====================

export type TaskStatus = 'todo' | 'inprogress' | 'pending' | 'done' | 'cancelled'
export type TaskType = 'normal' | 'direct'

export interface Task {
  id: string
  projectId: string
  title: string | null
  description: string
  status: TaskStatus
  agentCli: BaseCodingAgent
  agentId?: string // 🔹 新增：用户选择的 agent ID
  modelId?: string // 使用的模型
  taskType: TaskType
  directBranch?: string
  imageIds?: string[]
  position: number
  createdAt: string
  updatedAt: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
}

export interface TaskSwarmConfig {
  swarmId: string
  modelId: string
  maxIterations: number
}

 export interface UpdateTaskInput {
  title?: string | null
  description?: string
  status?: TaskStatus
  agentCli?: BaseCodingAgent
  agentId?: string // 🔹 添加 agentId
  modelId?: string
  position?: number
  taskType?: TaskType
  directBranch?: string
  imageIds?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface CreateTaskInput {
  projectId: string
  description: string
  status?: TaskStatus
  agentCli?: BaseCodingAgent
  agentId?: string // 🔹 用户选择的 agent ID
  modelId?: string // 使用的模型
  title?: string | null
  position?: number
  taskType?: TaskType
  directBranch?: string
  imageIds?: string[]
}

export interface MoveTaskInput {
  taskId: string
  sourceStatus: TaskStatus
  destinationStatus: TaskStatus
  newPosition: number
}

export interface DragState {
  isDragging: boolean
  draggedTaskId: string | null
  sourceStatus: TaskStatus | null
}

// ==================== Selectors ====================

export const taskSelectors = {
  selectTasks: (state: TaskState) => state.tasks,
  selectTasksByProject: (projectId: string) => (state: TaskState) =>
    state.tasks.filter((t) => t.projectId === projectId),
  selectTasksByStatus: (status: TaskStatus) => (state: TaskState) =>
    state.tasks.filter((t) => t.status === status),
  selectCurrentTask: (state: TaskState) => state.currentTask,
  selectIsLoading: (state: TaskState) => state.isLoading,
  selectError: (state: TaskState) => state.error,
  selectDragState: (state: TaskState) => state.dragState,
  selectOptimisticTasks: (state: TaskState) => state.optimisticTasks,
  selectTaskById: (id: string) => (state: TaskState) =>
    state.tasks.find((t) => t.id === id),
}

// ==================== State Interface ====================

interface TaskState {
  // State
  tasks: Task[]
  currentTask: Task | null
  isLoading: boolean
  error: string | null
  dragState: DragState
  optimisticTasks: Map<string, Task>

  // Actions - CRUD
  fetchTasks: (projectId: string) => Promise<void>
  fetchTaskById: (id: string) => Promise<Task | null>
  createTask: (data: CreateTaskInput) => Promise<Task>
  updateTask: (id: string, data: UpdateTaskInput) => Promise<Task>
  deleteTask: (id: string) => Promise<void>

  // Actions - Drag & Drop
  moveTask: (input: MoveTaskInput) => Promise<void>
  setDragState: (state: Partial<DragState>) => void
  clearDragState: () => void

  // Actions - Selection
  setCurrentTask: (task: Task | null) => void
  clearError: () => void

  // Actions - Optimistic Updates
  addOptimisticTask: (task: Task) => void
  removeOptimisticTask: (taskId: string) => void
  updateOptimisticTask: (taskId: string, updates: Partial<Task>) => void
}

// ==================== Store Implementation ====================

export const useTaskStore = create<TaskState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        tasks: [],
        currentTask: null,
        isLoading: false,
        error: null,
        dragState: {
          isDragging: false,
          draggedTaskId: null,
          sourceStatus: null,
        },
        optimisticTasks: new Map(),

        // CRUD Actions
        fetchTasks: async (projectId: string) => {
          set({ isLoading: true, error: null }, false, 'fetchTasks/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/projects/${projectId}/tasks`))
            if (!response.ok) throw new Error('Failed to fetch tasks')
            const tasks = await response.json()
            set({ tasks, isLoading: false }, false, 'fetchTasks/fulfilled')
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'fetchTasks/rejected')
          }
        },

        fetchTaskById: async (id: string) => {
          set({ isLoading: true, error: null }, false, 'fetchTaskById/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/tasks/${id}`))
            if (!response.ok) throw new Error('Failed to fetch task')
            const task = await response.json()
            set({ isLoading: false }, false, 'fetchTaskById/fulfilled')
            return task
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'fetchTaskById/rejected')
            return null
          }
        },

        createTask: async (data: CreateTaskInput) => {
          console.log('[taskStore] createTask called with:', data)
          set({ isLoading: true, error: null }, false, 'createTask/pending')
          try {
            const url = resolveHttpUrl(`/api/projects/${data.projectId}/tasks`)
            console.log('[taskStore] Fetching:', url, 'with body:', JSON.stringify(data))
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            console.log('[taskStore] Response status:', response.status, 'ok:', response.ok)
            if (!response.ok) {
              const errorText = await response.text()
              console.error('[taskStore] Error response:', errorText)
              throw new Error('Failed to create task: ' + errorText)
            }
            const task = await response.json()
            console.log('[taskStore] Created task:', task)
            set(
              (state) => ({
                tasks: [...state.tasks, task],
                isLoading: false,
              }),
              false,
              'createTask/fulfilled'
            )
            return task
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'createTask/rejected')
            throw error
          }
        },

        updateTask: async (id: string, data: UpdateTaskInput) => {
          set({ isLoading: true, error: null }, false, 'updateTask/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/tasks/${id}`), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (!response.ok) throw new Error('Failed to update task')
            const updatedTask = await response.json()
            set(
              (state) => ({
                tasks: state.tasks.map((t) =>
                  t.id === id ? updatedTask : t
                ),
                currentTask:
                  state.currentTask?.id === id
                    ? updatedTask
                    : state.currentTask,
                isLoading: false,
              }),
              false,
              'updateTask/fulfilled'
            )
            return updatedTask
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'updateTask/rejected')
            throw error
          }
        },

        deleteTask: async (id: string) => {
          set({ isLoading: true, error: null }, false, 'deleteTask/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/tasks/${id}`), {
              method: 'DELETE',
            })
            if (!response.ok) throw new Error('Failed to delete task')
            set(
              (state) => ({
                tasks: state.tasks.filter((t) => t.id !== id),
                currentTask:
                  state.currentTask?.id === id ? null : state.currentTask,
                isLoading: false,
              }),
              false,
              'deleteTask/fulfilled'
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'deleteTask/rejected')
            throw error
          }
        },

        // Drag & Drop Actions
        moveTask: async (input: MoveTaskInput) => {
          const { taskId, sourceStatus, destinationStatus, newPosition } = input
          const state = get()

          // Optimistic update
          const previousTasks = [...state.tasks]
          const updatedTasks = state.tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                status: destinationStatus,
                position: newPosition,
                updatedAt: new Date().toISOString(),
              }
            }
            return t
          })

          set(
            {
              tasks: updatedTasks,
              dragState: {
                isDragging: false,
                draggedTaskId: null,
                sourceStatus: null,
              },
            },
            false,
            'moveTask/optimistic'
          )

          try {
            const response = await fetch(resolveHttpUrl(`/api/tasks/${taskId}/move`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceStatus,
                destinationStatus,
                newPosition,
              }),
            })
            if (!response.ok) throw new Error('Failed to move task')
          } catch (error) {
            // Rollback on failure
            set({ tasks: previousTasks }, false, 'moveTask/rollback')
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message }, false, 'moveTask/rejected')
          }
        },

        setDragState: (dragState: Partial<DragState>) => {
          set(
            (state) => ({
              dragState: { ...state.dragState, ...dragState },
            }),
            false,
            'setDragState'
          )
        },

        clearDragState: () => {
          set(
            {
              dragState: {
                isDragging: false,
                draggedTaskId: null,
                sourceStatus: null,
              },
            },
            false,
            'clearDragState'
          )
        },

        // Selection Actions
        setCurrentTask: (task: Task | null) => {
          set({ currentTask: task }, false, 'setCurrentTask')
        },

        clearError: () => {
          set({ error: null }, false, 'clearError')
        },

        // Optimistic Update Actions
        addOptimisticTask: (task: Task) => {
          set(
            (state) => {
              const newOptimisticTasks = new Map(state.optimisticTasks)
              newOptimisticTasks.set(task.id, task)
              return { optimisticTasks: newOptimisticTasks }
            },
            false,
            'addOptimisticTask'
          )
        },

        removeOptimisticTask: (taskId: string) => {
          set(
            (state) => {
              const newOptimisticTasks = new Map(state.optimisticTasks)
              newOptimisticTasks.delete(taskId)
              return { optimisticTasks: newOptimisticTasks }
            },
            false,
            'removeOptimisticTask'
          )
        },

        updateOptimisticTask: (taskId: string, updates: Partial<Task>) => {
          set(
            (state) => {
              const existingTask = state.optimisticTasks.get(taskId)
              if (!existingTask) return state

              const newOptimisticTasks = new Map(state.optimisticTasks)
              newOptimisticTasks.set(taskId, { ...existingTask, ...updates })
              return { optimisticTasks: newOptimisticTasks }
            },
            false,
            'updateOptimisticTask'
          )
        },
      }),
      {
        name: 'task-store',
        partialize: (state) => ({
          currentTask: state.currentTask,
        }),
      }
    ),
    { name: 'TaskStore' }
  )
)
