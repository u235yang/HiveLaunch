// SSE Stream Message Types for Agent Execution

// Base entry interface
export interface StreamEntry {
  id: string
  type: StreamEntryType
  timestamp: string
  content?: string
}

export type StreamEntryType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_use'
  | 'tool_result'
  | 'error_message'
  | 'system_message'
  | 'thinking'
  | 'typing_indicator'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'execution_stopped'
  | 'token_usage_info'

// User message entry
export interface UserMessageEntry extends StreamEntry {
  type: 'user_message'
  content: string
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  name: string
  type: 'file' | 'image' | 'code'
  content?: string
}

// Assistant message entry
export interface AssistantMessageEntry extends StreamEntry {
  type: 'assistant_message'
  content: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// Tool use entry (for collapsible tool section)
export interface ToolUseEntry extends StreamEntry {
  type: 'tool_use'
  tool_name: string
  tool_call_id?: string
  action_type?: string
  status: 'started' | 'running' | 'completed' | 'failed'
  parameters?: Record<string, unknown>
  output?: string
}

// Tool result entry
export interface ToolResultEntry extends StreamEntry {
  type: 'tool_result'
  tool_call_id: string
  success: boolean
  result?: string
  error?: string
}

// Error message entry
export interface ErrorMessageEntry extends StreamEntry {
  type: 'error_message'
  message: string
  code?: string
  recoverable: boolean
}

// System message entry
export interface SystemMessageEntry extends StreamEntry {
  type: 'system_message'
  message: string
  level?: 'info' | 'warning' | 'error'
}

// Thinking entry (for agent thinking process)
export interface ThinkingEntry extends StreamEntry {
  type: 'thinking'
  content: string
}

// Execution state entries
export interface ExecutionStartedEntry extends StreamEntry {
  type: 'execution_started'
  session_id: string
  agent_name: string
}

export interface ExecutionCompletedEntry extends StreamEntry {
  type: 'execution_completed'
  session_id: string
  duration_ms?: number
  summary?: string
}

export interface ExecutionFailedEntry extends StreamEntry {
  type: 'execution_failed'
  session_id: string
  reason?: string
  error?: string
}

export interface ExecutionStoppedEntry extends StreamEntry {
  type: 'execution_stopped'
  session_id: string
  stopped_by: string
}

// Token usage info entry
export interface TokenUsageInfoEntry extends StreamEntry {
  type: 'token_usage_info'
  total_tokens: number
  model_context_window: number
}

// Typing indicator entry
export interface TypingIndicatorEntry extends StreamEntry {
  type: 'typing_indicator'
  agent_name: string
}

// Union type for all entries
export type StreamMessage =
  | UserMessageEntry
  | AssistantMessageEntry
  | ToolUseEntry
  | ToolResultEntry
  | ErrorMessageEntry
  | SystemMessageEntry
  | ThinkingEntry
  | ExecutionStartedEntry
  | ExecutionCompletedEntry
  | ExecutionFailedEntry
  | ExecutionStoppedEntry
  | TokenUsageInfoEntry
  | TypingIndicatorEntry

// API Route types
export interface StreamRequestParams {
  session_id: string
  attempt_id?: string
}

export interface FollowUpRequest {
  session_id: string
  message: string
  attempt_id?: string
}

// SSE Event types for client
export interface SSEEvent {
  id: string
  event: StreamEntryType
  data: StreamMessage
}
