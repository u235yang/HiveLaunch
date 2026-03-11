// Types for vibe-chat components
// Aligned with vibe-kanban/shared/types.ts

/**
 * Tool status type for indicating the state of a tool execution
 */
export type ToolStatus =
  | { status: 'created' }
  | { status: 'success' }
  | { status: 'failed' }
  | { status: 'denied'; reason?: string | null }
  | { status: 'pending_approval'; approval_id: string; requested_at: string; timeout_at: string }
  | { status: 'timed_out' }

/**
 * File change action types
 */
export type FileChange =
  | { action: 'write'; content: string }
  | { action: 'delete' }
  | { action: 'rename'; new_path: string }
  | { action: 'edit'; unified_diff: string; has_line_numbers?: boolean }

/**
 * Todo item status
 */
export type TodoItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

/**
 * Todo item
 */
export interface TodoItem {
  content: string
  status?: TodoItemStatus
}

/**
 * Command exit status
 */
export type CommandExitStatus =
  | { type: 'success'; success: boolean }
  | { type: 'exit_code'; code: number }

/**
 * Command run result
 */
export interface CommandRunResult {
  exit_status: CommandExitStatus | null
  output: string | null
}

/**
 * Tool result value type
 */
export type ToolResultValueType =
  | { type: 'markdown' }
  | { type: 'json' }

/**
 * Tool result
 */
export interface ToolResult {
  type: ToolResultValueType
  value: unknown
}

/**
 * Action types for tool use
 */
export type ActionType =
  | { action: 'file_read'; path: string; result?: ToolResult }
  | { action: 'file_edit'; path: string; changes: FileChange[] }
  | { action: 'command_run'; command: string; result?: CommandRunResult & { output?: string } }
  | { action: 'search'; query: string; result?: ToolResult }
  | { action: 'web_fetch'; url: string; result?: ToolResult }
  | { action: 'todo_management'; todos: TodoItem[] }
  | { action: 'task_create'; task_title: string }
  | { action: 'plan_presentation'; plan: string }
  | { action: 'tool'; tool_name: string; arguments?: Record<string, unknown>; result?: ToolResult }

/**
 * Normalized entry type (discriminated union)
 */
export type NormalizedEntryType =
  | { type: 'user_message' }
  | { type: 'user_feedback'; denied_tool: string }
  | { type: 'assistant_message' }
  | { type: 'system_message' }
  | { type: 'error_message' }
  | { type: 'thinking' }
  | { type: 'loading' }
  | { type: 'token_usage_info'; total_tokens: number; model_context_window: number }
  | { type: 'tool_use'; action_type: ActionType; tool_name: string; status: ToolStatus }
  | { type: 'next_action'; failed: boolean; needs_setup: boolean; execution_processes: string[] }

/**
 * Normalized entry
 */
export interface NormalizedEntry {
  timestamp: string | null
  entry_type: NormalizedEntryType
  content: string
}
