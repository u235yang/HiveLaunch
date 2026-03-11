import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

// ==================== Types ====================

export interface Project {
  id: string
  name: string
  description?: string
  repoPath: string
  targetBranch: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description?: string
  repoPath: string
  targetBranch?: string
  swarmId?: string  // 蜂群 ID，用于绑定
  swarmName?: string  // 蜂群名称
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  repoPath?: string
  targetBranch?: string
}

// ==================== Selectors ====================

export const projectSelectors = {
  selectProjects: (state: ProjectState) => state.projects,
  selectCurrentProject: (state: ProjectState) => state.currentProject,
  selectIsLoading: (state: ProjectState) => state.isLoading,
  selectError: (state: ProjectState) => state.error,
  selectProjectById: (id: string) => (state: ProjectState) =>
    state.projects.find(p => p.id === id),
}

// ==================== State Interface ====================

interface ProjectState {
  // State
  projects: Project[]
  currentProject: Project | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchProjects: () => Promise<void>
  fetchProjectById: (id: string) => Promise<Project | null>
  createProject: (data: CreateProjectInput) => Promise<Project>
  updateProject: (id: string, data: UpdateProjectInput) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
  clearError: () => void
}

// ==================== Store Implementation ====================

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        projects: [],
        currentProject: null,
        isLoading: false,
        error: null,

        // Actions
        fetchProjects: async () => {
          set({ isLoading: true, error: null }, false, 'fetchProjects/pending')
          try {
            const response = await fetch(resolveHttpUrl('/api/projects'))
            if (!response.ok) throw new Error('Failed to fetch projects')
            const projects = await response.json()
            set({ projects, isLoading: false }, false, 'fetchProjects/fulfilled')
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'fetchProjects/rejected')
          }
        },

        fetchProjectById: async (id: string) => {
          console.log('[projectStore] fetchProjectById called with id:', id)
          set({ isLoading: true, error: null }, false, 'fetchProjectById/pending')
          try {
            const url = resolveHttpUrl(`/api/projects/${id}`)
            console.log('[projectStore] Fetching from:', url)
            const response = await fetch(url)
            console.log('[projectStore] Response status:', response.status, 'ok:', response.ok)
            if (!response.ok) {
              const errorText = await response.text()
              console.error('[projectStore] Response error:', errorText)
              throw new Error(`Failed to fetch project: ${response.status} - ${errorText}`)
            }
            const project = await response.json()
            console.log('[projectStore] Fetched project:', project)
            console.log('[projectStore] project.targetBranch:', project.targetBranch)
            console.log('[projectStore] project.repoPath:', project.repoPath)
            set({ isLoading: false }, false, 'fetchProjectById/fulfilled')
            return project
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error('[projectStore] fetchProjectById error:', message, error)
            set({ error: message, isLoading: false }, false, 'fetchProjectById/rejected')
            return null
          }
        },

        createProject: async (data: CreateProjectInput) => {
          set({ isLoading: true, error: null }, false, 'createProject/pending')
          try {
            // 转换字段名: camelCase -> snake_case (后端期望 snake_case)
            const payload = {
              name: data.name,
              description: data.description,
              repo_path: data.repoPath,
              target_branch: data.targetBranch,
              swarm_id: data.swarmId,
            }

            const response = await fetch(resolveHttpUrl('/api/projects'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })

            if (!response.ok) {
              // 尝试获取错误详情
              let errorMsg = 'Failed to create project'
              if (typeof response.json === 'function') {
                try {
                  const errData = await response.json()
                  errorMsg = errData.message || errData.error || errorMsg
                } catch {
                  if (typeof response.text === 'function') {
                    const errText = await response.text()
                    if (errText) errorMsg = errText
                  }
                }
              } else if (typeof response.text === 'function') {
                const errText = await response.text()
                if (errText) errorMsg = errText
              }
              throw new Error(errorMsg)
            }

            const project = await response.json()
            set(
              (state) => ({
                projects: [...state.projects, project],
                isLoading: false,
              }),
              false,
              'createProject/fulfilled'
            )
            return project
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'createProject/rejected')
            throw error
          }
        },

        updateProject: async (id: string, data: UpdateProjectInput) => {
          set({ isLoading: true, error: null }, false, 'updateProject/pending')
          try {
            // 转换字段名: camelCase -> snake_case (后端期望 snake_case)
            const payload: Record<string, unknown> = {}
            if (data.name !== undefined) payload.name = data.name
            if (data.description !== undefined) payload.description = data.description
            if (data.repoPath !== undefined) payload.repo_path = data.repoPath
            if (data.targetBranch !== undefined) payload.target_branch = data.targetBranch

            const response = await fetch(resolveHttpUrl(`/api/projects/${id}`), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })

            if (!response.ok) {
              let errorMsg = 'Failed to update project'
              if (typeof response.json === 'function') {
                try {
                  const errData = await response.json()
                  errorMsg = errData.message || errData.error || errorMsg
                } catch {
                  if (typeof response.text === 'function') {
                    const errText = await response.text()
                    if (errText) errorMsg = errText
                  }
                }
              } else if (typeof response.text === 'function') {
                const errText = await response.text()
                if (errText) errorMsg = errText
              }
              throw new Error(errorMsg)
            }

            const updatedProject = await response.json()
            set(
              (state) => ({
                projects: state.projects.map((p) =>
                  p.id === id ? updatedProject : p
                ),
                currentProject:
                  state.currentProject?.id === id
                    ? updatedProject
                    : state.currentProject,
                isLoading: false,
              }),
              false,
              'updateProject/fulfilled'
            )
            return updatedProject
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'updateProject/rejected')
            throw error
          }
        },

        deleteProject: async (id: string) => {
          set({ isLoading: true, error: null }, false, 'deleteProject/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/projects/${id}`), {
              method: 'DELETE',
            })
            if (!response.ok) throw new Error('Failed to delete project')
            set(
              (state) => ({
                projects: state.projects.filter((p) => p.id !== id),
                currentProject:
                  state.currentProject?.id === id ? null : state.currentProject,
                isLoading: false,
              }),
              false,
              'deleteProject/fulfilled'
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'deleteProject/rejected')
            throw error
          }
        },

        setCurrentProject: (project: Project | null) => {
          set({ currentProject: project }, false, 'setCurrentProject')
        },

        clearError: () => {
          set({ error: null }, false, 'clearError')
        },
      }),
      {
        name: 'project-store',
        partialize: (state) => ({
          currentProject: state.currentProject,
        }),
      }
    ),
    { name: 'ProjectStore' }
  )
)
