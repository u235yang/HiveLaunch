import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

// ==================== Types ====================

export interface TokenUsageRecord {
  id: string
  taskId: string
  projectId: string
  modelId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  timestamp: string
  agentName?: string
  swarmId?: string
}

export interface TokenSummary {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalCost: number
  recordCount: number
}

export interface TokenStats {
  summary: TokenSummary
  byModel: Record<string, TokenSummary>
  byProject: Record<string, TokenSummary>
  byDay: Record<string, TokenSummary>
  trend: 'up' | 'down' | 'stable'
  trendPercentage: number
}

export interface TokenFilters {
  projectId?: string
  modelId?: string
  startDate?: string
  endDate?: string
  agentName?: string
}

// ==================== Selectors ====================

export const tokenSelectors = {
  selectRecords: (state: TokenState) => state.records,
  selectSummary: (state: TokenState) => state.summary,
  selectStats: (state: TokenState) => state.stats,
  selectIsLoading: (state: TokenState) => state.isLoading,
  selectError: (state: TokenState) => state.error,
  selectFilters: (state: TokenState) => state.filters,
  selectRecentRecords: (limit: number) => (state: TokenState) =>
    [...state.records]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, limit),
  selectRecordsByProject: (projectId: string) => (state: TokenState) =>
    state.records.filter((r) => r.projectId === projectId),
}

// ==================== State Interface ====================

interface TokenState {
  // State
  records: TokenUsageRecord[]
  summary: TokenSummary
  stats: TokenStats | null
  isLoading: boolean
  error: string | null
  filters: TokenFilters

  // Actions
  fetchRecords: (filters?: TokenFilters) => Promise<void>
  fetchStats: (period?: 'day' | 'week' | 'month') => Promise<void>
  fetchSummary: (filters?: TokenFilters) => Promise<void>
  setFilters: (filters: Partial<TokenFilters>) => void
  clearFilters: () => void
  clearError: () => void
}

// ==================== Store Implementation ====================

export const useTokenStore = create<TokenState>()(
  devtools(
    (set, get) => ({
      // Initial State
      records: [],
      summary: {
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        recordCount: 0,
      },
      stats: null,
      isLoading: false,
      error: null,
      filters: {},

      // Actions
      fetchRecords: async (filters?: TokenFilters) => {
        set({ isLoading: true, error: null }, false, 'fetchRecords/pending')
        try {
          const params = new URLSearchParams()
          if (filters?.projectId) params.set('projectId', filters.projectId)
          if (filters?.modelId) params.set('modelId', filters.modelId)
          if (filters?.startDate) params.set('startDate', filters.startDate)
          if (filters?.endDate) params.set('endDate', filters.endDate)
          if (filters?.agentName) params.set('agentName', filters.agentName)

          const response = await fetch(
            resolveHttpUrl(`/api/token-usage?${params.toString()}`)
          )
          if (!response.ok) throw new Error('Failed to fetch token records')
          const records = await response.json()
          set({ records, isLoading: false }, false, 'fetchRecords/fulfilled')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          set({ error: message, isLoading: false }, false, 'fetchRecords/rejected')
        }
      },

      fetchStats: async (period: 'day' | 'week' | 'month' = 'week') => {
        set({ isLoading: true, error: null }, false, 'fetchStats/pending')
        try {
          const response = await fetch(resolveHttpUrl(`/api/token-usage/stats?period=${period}`))
          if (!response.ok) throw new Error('Failed to fetch token stats')
          const stats = await response.json()
          set({ stats, isLoading: false }, false, 'fetchStats/fulfilled')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          set({ error: message, isLoading: false }, false, 'fetchStats/rejected')
        }
      },

      fetchSummary: async (filters?: TokenFilters) => {
        set({ isLoading: true, error: null }, false, 'fetchSummary/pending')
        try {
          const params = new URLSearchParams()
          if (filters?.projectId) params.set('projectId', filters.projectId)
          if (filters?.modelId) params.set('modelId', filters.modelId)
          if (filters?.startDate) params.set('startDate', filters.startDate)
          if (filters?.endDate) params.set('endDate', filters.endDate)

          const response = await fetch(
            resolveHttpUrl(`/api/token-usage/summary?${params.toString()}`)
          )
          if (!response.ok) throw new Error('Failed to fetch token summary')
          const summary = await response.json()
          set({ summary, isLoading: false }, false, 'fetchSummary/fulfilled')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          set({ error: message, isLoading: false }, false, 'fetchSummary/rejected')
        }
      },

      setFilters: (filters: Partial<TokenFilters>) => {
        set(
          (state) => ({
            filters: { ...state.filters, ...filters },
          }),
          false,
          'setFilters'
        )
      },

      clearFilters: () => {
        set({ filters: {} }, false, 'clearFilters')
      },

      clearError: () => {
        set({ error: null }, false, 'clearError')
      },
    }),
    { name: 'TokenStore' }
  )
)
