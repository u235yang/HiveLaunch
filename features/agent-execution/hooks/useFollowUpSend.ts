'use client'

import { useCallback, useState } from 'react'
import { sessionsApi } from '@/features/agent-execution/api/sessions'
import type {
  BaseCodingAgent,
  CreateFollowUpAttempt,
} from '@/features/agent-execution/types/execution-process'
import { buildAgentPrompt } from '@/features/agent-execution/lib/promptMessage'

type UseFollowUpSendArgs = {
  sessionId?: string
  message: string
  conflictMarkdown: string | null
  reviewMarkdown: string
  clickedMarkdown?: string
  executor: BaseCodingAgent | null
  variant: string | null
  clearComments: () => void
  clearClickedElements?: () => void
  onAfterSendCleanup: () => void
}

interface UseFollowUpSendResult {
  isSendingFollowUp: boolean
  followUpError: string | null
  setFollowUpError: (error: string | null) => void
  onSendFollowUp: () => Promise<void>
}

/**
 * Hook for sending follow-up messages with context (conflicts, review, etc.)
 * This is the more advanced version that composes prompt with context.
 */
export function useFollowUpSend({
  sessionId,
  message,
  conflictMarkdown,
  reviewMarkdown,
  clickedMarkdown,
  executor,
  variant,
  clearComments,
  clearClickedElements,
  onAfterSendCleanup,
}: UseFollowUpSendArgs): UseFollowUpSendResult {
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)

  const onSendFollowUp = useCallback(async () => {
    if (!sessionId || !executor) return
    const extraMessage = message.trim()
    const { prompt, isSlashCommand } = buildAgentPrompt(extraMessage, [
      conflictMarkdown,
      clickedMarkdown?.trim(),
      reviewMarkdown.trim(),
    ])

    if (!prompt) return
    try {
      setIsSendingFollowUp(true)
      setFollowUpError(null)
      const body: CreateFollowUpAttempt = {
        prompt: prompt,
        executorProfileId: { executor, variant },
        retryProcessId: null,
        forceWhenDirty: null,
        performGitReset: null,
      }
      await sessionsApi.followUp(sessionId, body)
      if (!isSlashCommand) {
        clearComments()
        clearClickedElements?.()
      }
      onAfterSendCleanup()
    } catch (error: unknown) {
      const err = error as { message?: string }
      setFollowUpError(
        `Failed to start follow-up execution: ${err.message ?? 'Unknown error'}`
      )
    } finally {
      setIsSendingFollowUp(false)
    }
  }, [
    sessionId,
    message,
    conflictMarkdown,
    reviewMarkdown,
    clickedMarkdown,
    executor,
    variant,
    clearComments,
    clearClickedElements,
    onAfterSendCleanup,
  ])

  return {
    isSendingFollowUp,
    followUpError,
    setFollowUpError,
    onSendFollowUp,
  }
}
