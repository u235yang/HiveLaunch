'use client'

import { useCallback, useState } from 'react'
import type { BaseCodingAgent } from '@/features/agent-execution/types/execution-process'
import { sessionsApi } from '@/features/agent-execution/api/sessions'
import { useCreateSession } from './useCreateSession'

interface UseSessionSendOptions {
  /** Session ID for existing sessions */
  sessionId: string | undefined
  /** Workspace ID for creating new sessions */
  workspaceId: string | undefined
  /** Whether in new session mode */
  isNewSessionMode: boolean
  /** Effective executor for new sessions */
  effectiveExecutor: BaseCodingAgent | null
  /** Callback when session is selected (to exit new session mode) */
  onSelectSession?: (sessionId: string) => void
}

interface UseSessionSendResult {
  /** Send a message. Returns true on success, false on failure. */
  send: (message: string, variant: string | null) => Promise<boolean>
  /** Whether a send operation is in progress */
  isSending: boolean
  /** Error message if send failed */
  error: string | null
  /** Clear the error */
  clearError: () => void
}

/**
 * Hook for sending messages in session chat.
 * Handles both new session creation and existing session follow-up.
 *
 * Unlike useFollowUpSend, this hook:
 * - Takes message/variant as parameters to send() (not captured in closure)
 * - Returns boolean for success/failure (caller handles cleanup)
 * - Has no prompt composition (no conflict/review/clicked markdown)
 */
export function useSessionSend({
  sessionId,
  workspaceId,
  isNewSessionMode,
  effectiveExecutor,
  onSelectSession,
}: UseSessionSendOptions): UseSessionSendResult {
  const { createSession, isCreating, error: createError, clearError: clearCreateError } =
    useCreateSession()
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)

  const send = useCallback(
    async (message: string, variant: string | null): Promise<boolean> => {
      const trimmed = message.trim()
      if (!trimmed) return false

      clearCreateError()
      setFollowUpError(null)

      if (isNewSessionMode) {
        // New session flow
        if (!workspaceId || !effectiveExecutor) {
          setFollowUpError('No executor selected')
          return false
        }
        try {
          const session = await createSession({
            workspaceId,
            prompt: trimmed,
            variant,
            executor: effectiveExecutor,
          })
          onSelectSession?.(session.id)
          return true
        } catch (e: unknown) {
          const err = e as { message?: string }
          setFollowUpError(
            `Failed to create session: ${err.message ?? 'Unknown error'}`
          )
          return false
        }
      } else {
        // Existing session flow
        if (!sessionId || !effectiveExecutor) return false
        setIsSendingFollowUp(true)
        try {
          await sessionsApi.followUp(sessionId, {
            prompt: trimmed,
            executorProfileId: { executor: effectiveExecutor, variant },
            retryProcessId: null,
            forceWhenDirty: null,
            performGitReset: null,
          })
          return true
        } catch (e: unknown) {
          const err = e as { message?: string }
          setFollowUpError(`Failed to send: ${err.message ?? 'Unknown error'}`)
          return false
        } finally {
          setIsSendingFollowUp(false)
        }
      }
    },
    [
      sessionId,
      workspaceId,
      isNewSessionMode,
      effectiveExecutor,
      createSession,
      onSelectSession,
      clearCreateError,
    ]
  )

  const clearError = useCallback(() => {
    clearCreateError()
    setFollowUpError(null)
  }, [clearCreateError])

  return {
    send,
    isSending: isSendingFollowUp || isCreating,
    error: followUpError || createError,
    clearError,
  }
}
