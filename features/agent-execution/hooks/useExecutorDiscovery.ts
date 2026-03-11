'use client'

import { useMemo, useCallback, useEffect, useState } from 'react'
import type { 
  BaseCodingAgent, 
  ExecutorDiscoveredOptions,
  SlashCommandDescription,
  ModelSelectorConfig,
  ModelProvider,
  ModelInfo,
  PermissionPolicy,
} from '@shared/types'
import { useJsonPatchWsStream } from './useJsonPatchWsStream'
import { resolveHttpUrl, resolveRealtimeUrl, environment, getTransportSnapshot } from '../lib/api-config'

const EMPTY_COMMANDS: SlashCommandDescription[] = []
const EXECUTOR_MAP: Record<string, BaseCodingAgent> = {
  OPENCODE: 'OPENCODE',
  OPENC0DE: 'OPENCODE',
  SISYPHUS: 'OPENCODE',
  CLAUDE: 'CLAUDE_CODE',
  CLAUDE_CODE: 'CLAUDE_CODE',
  CURSOR: 'CURSOR',
  CURSOR_AGENT: 'CURSOR',
  QWEN: 'QWEN',
  QWEN_CODE: 'QWEN',
  COPILOT: 'COPILOT',
  DROID: 'DROID',
  AMP: 'AMP',
  GEMINI: 'GEMINI',
}

function normalizeDiscoveryExecutor(agent: BaseCodingAgent | string | null | undefined): BaseCodingAgent | null {
  if (!agent) return null
  const normalized = agent.toUpperCase().replace(/-/g, '_')
  return EXECUTOR_MAP[normalized] ?? 'OPENCODE'
}

// Default empty model selector config
const defaultModelSelector: ModelSelectorConfig = {
  providers: [],
  models: [],
  agents: [],
  permissions: [],
  default_model: null,
}

/**
 * Unified state shape for discovered options (vibe-kanban style)
 */
type DiscoveredOptionsStreamState = {
  options: ExecutorDiscoveredOptions | null
}

/**
 * Hook for fetching executor discovered options from the backend via WebSocket
 * This is the unified API that includes slash commands, models, and agents
 */
export function useExecutorDiscovery(
  agent: BaseCodingAgent | string | null | undefined,
  opts?: { workspaceId?: string; repoId?: string; refresh?: boolean }
) {
  const { workspaceId, repoId } = opts ?? {}
  const isMobileRuntime = environment.isMobile()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const normalizedAgent = useMemo(() => normalizeDiscoveryExecutor(agent), [agent])

  const endpoint = useMemo(() => {
    if (!normalizedAgent) return undefined
    const params = new URLSearchParams()
    params.set('executor', normalizedAgent)
    if (workspaceId) params.set('workspace_id', workspaceId)
    if (repoId) params.set('repo_id', repoId)
    if (refreshTrigger > 0) params.set('refresh', refreshTrigger.toString())
    return resolveRealtimeUrl(`/api/agents/discovered-options/ws?${params.toString()}`)
  }, [normalizedAgent, workspaceId, repoId, refreshTrigger])

  // 刷新模型缓存
  const refreshModels = useCallback(async () => {
    if (!normalizedAgent) return

    setIsRefreshing(true)
    setRefreshError(null)
    try {
      const refreshUrl = resolveHttpUrl('/api/agents/model-cache/refresh')
      if (isMobileRuntime) {
        const snapshot = getTransportSnapshot()
        console.info('[mobile-model] refresh start', {
          agent: normalizedAgent,
          workspaceId,
          repoId,
          refreshUrl,
          transportMode: snapshot.mode,
          transportConnected: snapshot.connected,
          transportBackend: snapshot.backendInstanceId,
          transportSession: snapshot.sessionScope,
        })
      }
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executor: normalizedAgent })
      })
      if (isMobileRuntime) {
        const snapshot = getTransportSnapshot()
        console.info('[mobile-model] refresh response', {
          agent: normalizedAgent,
          workspaceId,
          repoId,
          status: response.status,
          ok: response.ok,
          transportMode: snapshot.mode,
          transportConnected: snapshot.connected,
          transportBackend: snapshot.backendInstanceId,
          transportSession: snapshot.sessionScope,
        })
      }
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `MODEL_REFRESH_FAILED_${response.status}`)
      }

      setRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('[executor-discovery] Failed to refresh models:', error)
      if (isMobileRuntime) {
        console.error('[mobile-model] refresh failed', {
          agent: normalizedAgent,
          workspaceId,
          repoId,
          error,
        })
      }
      setRefreshError(error instanceof Error ? error.message : '模型刷新失败')
    } finally {
      setIsRefreshing(false)
    }
  }, [normalizedAgent, isMobileRuntime, repoId, workspaceId])

  const refreshDiscovery = useCallback(() => {
    if (!normalizedAgent) return
    setRefreshError(null)
    setRefreshTrigger((prev) => prev + 1)
  }, [normalizedAgent])

  const initialData = useCallback(
    (): DiscoveredOptionsStreamState => ({
      options: null,
    }),
    []
  )

  const { data, error, isConnected, isInitialized } =
    useJsonPatchWsStream<DiscoveredOptionsStreamState>(
      endpoint,
      !!endpoint,
      initialData
    )

  useEffect(() => {
    console.info('[executor-discovery] params', {
      agent,
      normalizedAgent,
      workspaceId,
      repoId,
      endpoint,
      enabled: !!endpoint,
    })
    if (isMobileRuntime) {
      const snapshot = getTransportSnapshot()
      console.info('[mobile-model] discovery params', {
        agent,
        normalizedAgent,
        workspaceId,
        repoId,
        endpoint,
        enabled: !!endpoint,
        transportMode: snapshot.mode,
        transportConnected: snapshot.connected,
        transportBackend: snapshot.backendInstanceId,
        transportSession: snapshot.sessionScope,
      })
    }
  }, [agent, normalizedAgent, workspaceId, repoId, endpoint, isMobileRuntime])

  useEffect(() => {
    console.info('[executor-discovery] stream state', {
      isConnected,
      isInitialized,
      options: data?.options ? 'present' : 'null',
      hookError: error,
    })
    if (isMobileRuntime) {
      const snapshot = getTransportSnapshot()
      console.info('[mobile-model] discovery stream', {
        isConnected,
        isInitialized,
        optionsPresent: !!data?.options,
        hookError: error,
        transportMode: snapshot.mode,
        transportConnected: snapshot.connected,
        transportBackend: snapshot.backendInstanceId,
        transportSession: snapshot.sessionScope,
      })
    }
  }, [
    isConnected,
    isInitialized,
    data?.options,
    error,
    isMobileRuntime,
  ])

  // Extract and transform data for easier consumption
  const options = data?.options
  const modelSelector = options?.model_selector ?? defaultModelSelector
  
  // Convenience accessors
  const providers: ModelProvider[] = modelSelector.providers
  const models: ModelInfo[] = modelSelector.models
  const agents = modelSelector.agents
  const permissions: PermissionPolicy[] = modelSelector.permissions
  const defaultModel: string | null = modelSelector.default_model
  
  // Loading states
  const combinedError = options?.error ?? error ?? refreshError
  const loadingSlashCommands = options?.loading_slash_commands ?? (!isInitialized && !combinedError)
  const loadingModels = options?.loading_models ?? (!isInitialized && !combinedError)
  const loadingAgents = options?.loading_agents ?? (!isInitialized && !combinedError)
  const isLoading = loadingSlashCommands || loadingModels || loadingAgents

  return {
    // Full options object
    options,

    // Slash commands
    commands: options?.slash_commands ?? EMPTY_COMMANDS,
    discovering: loadingSlashCommands,

    // Model selector (full config)
    modelSelector,

    // Convenience accessors
    providers,
    models,
    agents,
    permissions,
    defaultModel,

    // Loading states
    loadingSlashCommands,
    loadingModels,
    loadingAgents,
    isLoading,

    // Common
    error: combinedError,
    isConnected,
    isInitialized,

    // Cache refresh
    refreshModels,
    refreshDiscovery,
    isRefreshing,
  }
}
