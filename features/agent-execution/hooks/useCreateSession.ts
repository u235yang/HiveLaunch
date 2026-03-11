'use client'

import { useState, useCallback } from 'react'
import { sessionsApi } from '@/features/agent-execution/api/sessions'
import type {
  Session,
  BaseCodingAgent,
} from '@/features/agent-execution/types/execution-process'

interface CreateSessionParams {
  workspaceId: string
  prompt: string
  variant: string | null
  executor: BaseCodingAgent
  agentId?: string // 🔹 用户选择的 agent ID
  modelId?: string // 模型 ID
  workingDir?: string | null
  imageIds?: string[]
}

interface UseCreateSessionResult {
  createSession: (params: CreateSessionParams) => Promise<Session>
  isCreating: boolean
  error: string | null
  clearError: () => void
}

/**
 * Hook for creating a new session and sending the first message.
 * This combines session creation with follow-up in a single operation.
 */
export function useCreateSession(): UseCreateSessionResult {
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createSession = useCallback(
    async ({
      workspaceId,
      prompt,
      variant,
      executor,
      modelId,
      workingDir,
      imageIds,
    }: CreateSessionParams): Promise<Session> => {
      console.log('[useCreateSession] createSession called:', {
        workspaceId,
        modelId,
        modelIdType: typeof modelId,
        executor,
      })
      setIsCreating(true)
      setError(null)

      try {
        // 1. Create session
        const createData = {
          workspace_id: workspaceId,
          executor,
          working_dir: workingDir ?? undefined,
          model: modelId ?? undefined,
        }
        console.log('[useCreateSession] Creating session with data:', createData)
        const session = await sessionsApi.create(createData)

        // 2. Send first prompt as follow-up
        const followUpData = {
          prompt,
          executorProfileId: { executor, variant },
          model: modelId, // 传递模型
          imageIds,
          retryProcessId: null,
          forceWhenDirty: null,
          performGitReset: null,
        }
        console.log('[useCreateSession] Sending follow-up with data:', followUpData)
        await sessionsApi.followUp(session.id, followUpData)

        return session
      } catch (e: unknown) {
        const err = e as { message?: string }
        const errorMessage = err.message ?? 'Failed to create session'
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setIsCreating(false)
      }
    },
    []
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    createSession,
    isCreating,
    error,
    clearError,
  }
}
