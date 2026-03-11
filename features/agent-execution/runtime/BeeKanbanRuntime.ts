// BeeKanbanRuntime.ts - Custom runtime for bee-kanban
// Adapts bee-kanban data flow to assistant-ui format

'use client'

import { useState, useCallback } from 'react'
import type { NormalizedEntry, NormalizedEntryType, PatchTypeWithKey, ActionType, ToolStatus } from '@/features/agent-execution/types'
import { useConversationHistory } from '@/features/agent-execution/hooks/useConversationHistory'

// assistant-ui message types
export interface AssistantMessage {
  id: string
  role: 'assistant' | 'user'
  content: string | ContentPart[]
  createdAt?: Date
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown>; result?: unknown }

/**
 * Convert NormalizedEntry to assistant-ui message format
 */
function normalizedEntryToMessages(entries: PatchTypeWithKey[]): AssistantMessage[] {
  const messages: AssistantMessage[] = []
  let currentAssistantParts: ContentPart[] = []
  let currentAssistantId: string | null = null

  for (const entry of entries) {
    if (entry.type !== 'NORMALIZED_ENTRY') continue

    const normalized = entry.content
    const { entry_type, content } = normalized

    switch (entry_type.type) {
      case 'user_message':
        // Flush any pending assistant message
        if (currentAssistantParts.length > 0 && currentAssistantId) {
          messages.push({
            id: currentAssistantId,
            role: 'assistant',
            content: currentAssistantParts,
          })
          currentAssistantParts = []
          currentAssistantId = null
        }
        // Add user message
        messages.push({
          id: entry.patchKey,
          role: 'user',
          content: content,
        })
        break

      case 'assistant_message':
        // Add text part to current assistant message
        if (!currentAssistantId) {
          currentAssistantId = entry.patchKey
        }
        currentAssistantParts.push({ type: 'text', text: content })
        break

      case 'thinking':
        // Add thinking as text with prefix
        if (!currentAssistantId) {
          currentAssistantId = entry.patchKey
        }
        currentAssistantParts.push({ type: 'text', text: `💭 ${content}` })
        break

      case 'tool_use':
        // Add tool call part
        if (!currentAssistantId) {
          currentAssistantId = entry.patchKey
        }
        const toolCall: ContentPart = {
          type: 'tool-call',
          toolCallId: entry.patchKey,
          toolName: entry_type.tool_name,
          args: extractToolArgs(entry_type.action_type),
          result: extractToolResult(entry_type.action_type, entry_type.status),
        }
        currentAssistantParts.push(toolCall)
        break

      case 'system_message':
        // Add as assistant message with system prefix
        messages.push({
          id: entry.patchKey,
          role: 'assistant',
          content: `ℹ️ ${content}`,
        })
        break

      case 'error_message':
        // Add as assistant message with error prefix
        messages.push({
          id: entry.patchKey,
          role: 'assistant',
          content: `❌ ${content}`,
        })
        break

      case 'loading':
        // Add loading indicator
        if (!currentAssistantId) {
          currentAssistantId = entry.patchKey
        }
        currentAssistantParts.push({ type: 'text', text: '⏳ 正在处理...' })
        break

      case 'next_action':
        // Skip next_action for now - will be handled separately
        break

      case 'token_usage_info':
        // Skip token usage info - handled separately
        break

      default:
        // Skip unknown types
        break
    }
  }

  // Flush any remaining assistant message
  if (currentAssistantParts.length > 0 && currentAssistantId) {
    messages.push({
      id: currentAssistantId,
      role: 'assistant',
      content: currentAssistantParts,
    })
  }

  return messages
}

/**
 * Extract tool arguments from ActionType
 */
function extractToolArgs(actionType: ActionType): Record<string, unknown> {
  switch (actionType.action) {
    case 'file_read':
      return { path: actionType.path }
    case 'file_edit':
      return { path: actionType.path, changes: actionType.changes }
    case 'command_run':
      return { command: actionType.command }
    case 'search':
      return { query: actionType.query }
    case 'web_fetch':
      return { url: actionType.url }
    case 'tool':
      return { tool_name: actionType.tool_name, arguments: actionType.arguments }
    case 'plan_presentation':
      return { plan: actionType.plan }
    case 'todo_management':
      return { todos: actionType.todos, operation: actionType.operation }
    case 'task_create':
      return { description: actionType.description, subagent_type: actionType.subagent_type }
    case 'other':
      return { description: actionType.description }
    default:
      return {}
  }
}

/**
 * Extract tool result from ActionType and ToolStatus
 */
function extractToolResult(
  actionType: ActionType,
  status: ToolStatus
): unknown {
  switch (actionType.action) {
    case 'command_run':
      return {
        status: status.status,
        output: actionType.result?.output,
        exitCode: actionType.result?.exit_status?.type === 'exit_code'
          ? actionType.result.exit_status.code
          : undefined,
      }
    case 'tool':
      return actionType.result
    case 'task_create':
      return actionType.result
    default:
      return { status: status.status }
  }
}

/**
 * Hook to convert bee-kanban data to assistant-ui format
 */
export function useBeeKanbanMessages(sessionId: string) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  const handleEntriesUpdated = useCallback(
    (entries: PatchTypeWithKey[], addType: string, loading: boolean) => {
      const newMessages = normalizedEntryToMessages(entries)
      setMessages(newMessages)
      setIsLoading(loading)
      setIsRunning(addType === 'running')
    },
    []
  )

  useConversationHistory({
    sessionId,
    onEntriesUpdated: handleEntriesUpdated,
  })

  return {
    messages,
    isLoading,
    isRunning,
  }
}
