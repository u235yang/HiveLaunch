import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

// ==================== Types ====================

export interface SwarmAgent {
  id: string
  name: string
  role: string
  modelId: string
  systemPrompt: string
  enabled: boolean
  order: number
}

export interface SwarmConfig {
  id: string
  name: string
  description: string
  agents: SwarmAgent[]
  createdAt: string
  updatedAt: string
  isDefault: boolean
}

export interface CreateSwarmInput {
  name: string
  description: string
  agents: Omit<SwarmAgent, 'id' | 'createdAt' | 'updatedAt'>[]
}

export interface UpdateSwarmInput {
  name?: string
  description?: string
  agents?: SwarmAgent[]
  isDefault?: boolean
}

// ==================== Selectors ====================

export const swarmSelectors = {
  selectSwarms: (state: SwarmState) => state.swarms,
  selectCurrentSwarm: (state: SwarmState) => state.currentSwarm,
  selectDefaultSwarm: (state: SwarmState) =>
    state.swarms.find((s) => s.isDefault),
  selectSwarmById: (id: string) => (state: SwarmState) =>
    state.swarms.find((s) => s.id === id),
  selectIsLoading: (state: SwarmState) => state.isLoading,
  selectError: (state: SwarmState) => state.error,
  selectEnabledAgents: (swarmId: string) => (state: SwarmState) => {
    const swarm = state.swarms.find((s) => s.id === swarmId)
    return swarm?.agents.filter((a) => a.enabled).sort((a, b) => a.order - b.order) || []
  },
}

// ==================== State Interface ====================

interface SwarmState {
  // State
  swarms: SwarmConfig[]
  currentSwarm: SwarmConfig | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchSwarms: () => Promise<void>
  fetchSwarmById: (id: string) => Promise<SwarmConfig | null>
  createSwarm: (data: CreateSwarmInput) => Promise<SwarmConfig>
  updateSwarm: (id: string, data: UpdateSwarmInput) => Promise<SwarmConfig>
  deleteSwarm: (id: string) => Promise<void>
  setCurrentSwarm: (swarm: SwarmConfig | null) => void
  addAgent: (swarmId: string, agent: Omit<SwarmAgent, 'id'>) => void
  updateAgent: (swarmId: string, agentId: string, updates: Partial<SwarmAgent>) => void
  removeAgent: (swarmId: string, agentId: string) => void
  reorderAgents: (swarmId: string, agentIds: string[]) => void
  clearError: () => void
}

// ==================== Store Implementation ====================

export const useSwarmStore = create<SwarmState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        swarms: [],
        currentSwarm: null,
        isLoading: false,
        error: null,

        // Actions
        fetchSwarms: async () => {
          set({ isLoading: true, error: null }, false, 'fetchSwarms/pending')
          try {
            const response = await fetch(resolveHttpUrl('/api/swarms'))
            if (!response.ok) throw new Error('Failed to fetch swarms')
            const swarms = await response.json()
            set({ swarms, isLoading: false }, false, 'fetchSwarms/fulfilled')
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'fetchSwarms/rejected')
          }
        },

        fetchSwarmById: async (id: string) => {
          set({ isLoading: true, error: null }, false, 'fetchSwarmById/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/swarms/${id}`))
            if (!response.ok) throw new Error('Failed to fetch swarm')
            const swarm = await response.json()
            set({ isLoading: false }, false, 'fetchSwarmById/fulfilled')
            return swarm
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'fetchSwarmById/rejected')
            return null
          }
        },

        createSwarm: async (data: CreateSwarmInput) => {
          set({ isLoading: true, error: null }, false, 'createSwarm/pending')
          try {
            const response = await fetch(resolveHttpUrl('/api/swarms'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (!response.ok) throw new Error('Failed to create swarm')
            const swarm = await response.json()
            set(
              (state) => ({
                swarms: [...state.swarms, swarm],
                isLoading: false,
              }),
              false,
              'createSwarm/fulfilled'
            )
            return swarm
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'createSwarm/rejected')
            throw error
          }
        },

        updateSwarm: async (id: string, data: UpdateSwarmInput) => {
          set({ isLoading: true, error: null }, false, 'updateSwarm/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/swarms/${id}`), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (!response.ok) throw new Error('Failed to update swarm')
            const updatedSwarm = await response.json()
            set(
              (state) => ({
                swarms: state.swarms.map((s) =>
                  s.id === id ? updatedSwarm : s
                ),
                currentSwarm:
                  state.currentSwarm?.id === id
                    ? updatedSwarm
                    : state.currentSwarm,
                isLoading: false,
              }),
              false,
              'updateSwarm/fulfilled'
            )
            return updatedSwarm
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'updateSwarm/rejected')
            throw error
          }
        },

        deleteSwarm: async (id: string) => {
          set({ isLoading: true, error: null }, false, 'deleteSwarm/pending')
          try {
            const response = await fetch(resolveHttpUrl(`/api/swarms/${id}`), {
              method: 'DELETE',
            })
            if (!response.ok) throw new Error('Failed to delete swarm')
            set(
              (state) => ({
                swarms: state.swarms.filter((s) => s.id !== id),
                currentSwarm:
                  state.currentSwarm?.id === id
                    ? null
                    : state.currentSwarm,
                isLoading: false,
              }),
              false,
              'deleteSwarm/fulfilled'
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            set({ error: message, isLoading: false }, false, 'deleteSwarm/rejected')
            throw error
          }
        },

        setCurrentSwarm: (swarm: SwarmConfig | null) => {
          set({ currentSwarm: swarm }, false, 'setCurrentSwarm')
        },

        addAgent: (swarmId: string, agent: Omit<SwarmAgent, 'id'>) => {
          set(
            (state) => ({
              swarms: state.swarms.map((s) => {
                if (s.id === swarmId) {
                  const newAgent: SwarmAgent = {
                    ...agent,
                    id: `agent-${Date.now()}`,
                    enabled: true,
                    order: s.agents.length,
                  }
                  return {
                    ...s,
                    agents: [...s.agents, newAgent],
                    updatedAt: new Date().toISOString(),
                  }
                }
                return s
              }),
              currentSwarm:
                state.currentSwarm?.id === swarmId
                  ? {
                      ...state.currentSwarm,
                      agents: [
                        ...state.currentSwarm.agents,
                        {
                          ...agent,
                          id: `agent-${Date.now()}`,
                          enabled: true,
                          order: state.currentSwarm.agents.length,
                        },
                      ],
                      updatedAt: new Date().toISOString(),
                    }
                  : state.currentSwarm,
            }),
            false,
            'addAgent'
          )
        },

        updateAgent: (
          swarmId: string,
          agentId: string,
          updates: Partial<SwarmAgent>
        ) => {
          set(
            (state) => ({
              swarms: state.swarms.map((s) => {
                if (s.id === swarmId) {
                  return {
                    ...s,
                    agents: s.agents.map((a) =>
                      a.id === agentId ? { ...a, ...updates } : a
                    ),
                    updatedAt: new Date().toISOString(),
                  }
                }
                return s
              }),
              currentSwarm:
                state.currentSwarm?.id === swarmId
                  ? {
                      ...state.currentSwarm,
                      agents: state.currentSwarm.agents.map((a) =>
                        a.id === agentId ? { ...a, ...updates } : a
                      ),
                      updatedAt: new Date().toISOString(),
                    }
                  : state.currentSwarm,
            }),
            false,
            'updateAgent'
          )
        },

        removeAgent: (swarmId: string, agentId: string) => {
          set(
            (state) => ({
              swarms: state.swarms.map((s) => {
                if (s.id === swarmId) {
                  return {
                    ...s,
                    agents: s.agents.filter((a) => a.id !== agentId),
                    updatedAt: new Date().toISOString(),
                  }
                }
                return s
              }),
              currentSwarm:
                state.currentSwarm?.id === swarmId
                  ? {
                      ...state.currentSwarm,
                      agents: state.currentSwarm.agents.filter(
                        (a) => a.id !== agentId
                      ),
                      updatedAt: new Date().toISOString(),
                    }
                  : state.currentSwarm,
            }),
            false,
            'removeAgent'
          )
        },

        reorderAgents: (swarmId: string, agentIds: string[]) => {
          set(
            (state) => {
              const currentSwarmAgents = state.currentSwarm?.id === swarmId
                ? state.currentSwarm.agents
                : null

              const reorderedCurrentSwarmAgents = currentSwarmAgents
                ? (() => {
                    const agentMap = new Map(currentSwarmAgents.map((a) => [a.id, a]))
                    return agentIds
                      .map((id, index) => agentMap.get(id))
                      .filter((a): a is SwarmAgent => a !== undefined)
                      .map((a, idx) => ({ ...a, order: idx }))
                  })()
                : null

              return {
                swarms: state.swarms.map((s) => {
                  if (s.id === swarmId) {
                    const agentMap = new Map(s.agents.map((a) => [a.id, a]))
                    const reorderedAgents = agentIds
                      .map((id, index) => agentMap.get(id))
                      .filter((a): a is SwarmAgent => a !== undefined)
                      .map((a, idx) => ({ ...a, order: idx }))
                    return {
                      ...s,
                      agents: reorderedAgents,
                      updatedAt: new Date().toISOString(),
                    }
                  }
                  return s
                }),
                currentSwarm:
                  state.currentSwarm?.id === swarmId && reorderedCurrentSwarmAgents
                    ? {
                        ...state.currentSwarm,
                        agents: reorderedCurrentSwarmAgents,
                        updatedAt: new Date().toISOString(),
                      }
                    : state.currentSwarm,
              }
            },
            false,
            'reorderAgents'
          )
        },

        clearError: () => {
          set({ error: null }, false, 'clearError')
        },
      }),
      {
        name: 'swarm-store',
        partialize: (state) => ({
          currentSwarm: state.currentSwarm,
        }),
      }
    ),
    { name: 'SwarmStore' }
  )
)
