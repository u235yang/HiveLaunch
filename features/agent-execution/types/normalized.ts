// normalized.ts - NormalizedEntry types
// Synced with infra/tauri/src/executor/logs/mod.rs

// ========== Command Execution ==========

export type CommandExitStatus =
  | { type: 'exit_code'; code: number }
  | { type: 'success'; success: boolean }

export interface CommandRunResult {
  exit_status?: CommandExitStatus
  output?: string
}

// ========== Tool Result ==========

export type ToolResultValueType = 'markdown' | 'json'

export interface ToolResult {
  type: ToolResultValueType
  value: unknown
}

// ========== File Change ==========

export type FileChange =
  | { action: 'write'; content: string }
  | { action: 'delete' }
  | { action: 'rename'; new_path: string }
  | { action: 'edit'; unified_diff: string; has_line_numbers: boolean }

// ========== Action Types ==========

export type ActionType =
  | { action: 'file_read'; path: string }
  | { action: 'file_edit'; path: string; changes: FileChange[] }
  | { action: 'command_run'; command: string; result?: CommandRunResult }
  | { action: 'search'; query: string }
  | { action: 'web_fetch'; url: string }
  | {
      action: 'tool'
      tool_name: string
      arguments?: Record<string, unknown>
      result?: ToolResult
    }
  | {
      action: 'task_create'
      description: string
      subagent_type?: string
      result?: ToolResult
    }
  | { action: 'plan_presentation'; plan: string }
  | { action: 'todo_management'; todos: TodoItem[]; operation: string }
  | { action: 'other'; description: string }

export interface TodoItem {
  content: string
  status: string
  priority?: string
}

// ========== Tool Status ==========

export type ToolStatus =
  | { status: 'created' }
  | { status: 'success' }
  | { status: 'failed' }
  | { status: 'denied'; reason?: string }
  | {
      status: 'pending_approval'
      approval_id: string
      requested_at: string
      timeout_at: string
    }
  | { status: 'timed_out' }

// ========== Normalized Entry Types ==========

export type NormalizedEntryError =
  | { type: 'setup_required' }
  | { type: 'other' }

export type NormalizedEntryType =
  | { type: 'user_message' }
  | { type: 'user_feedback'; denied_tool: string }
  | { type: 'assistant_message' }
  | {
      type: 'tool_use'
      tool_name: string
      action_type: ActionType
      status: ToolStatus
    }
  | { type: 'system_message' }
  | { type: 'error_message'; error_type: NormalizedEntryError }
  | { type: 'thinking' }
  | { type: 'loading' }
  | {
      type: 'next_action'
      failed: boolean
      execution_processes: number
      needs_setup: boolean
      setup_help_text?: string | null
    }
  | { type: 'token_usage_info'; total_tokens: number; model_context_window: number }

// ========== Normalized Entry ==========

export interface NormalizedEntry {
  timestamp?: string | null
  entry_type: NormalizedEntryType
  content: string
  metadata?: Record<string, unknown>
}

// ========== Token Usage ==========

export interface TokenUsageInfo {
  total_tokens: number
  model_context_window: number
}

// ========== Patch Types ==========

export interface Diff {
  change: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'permission_change'
  oldPath?: string | null
  newPath?: string | null
  oldContent?: string | null
  newContent?: string | null
  contentOmitted?: boolean
  additions?: number | null
  deletions?: number | null
  repoId?: string | null
}

export type PatchType =
  | { type: 'NORMALIZED_ENTRY'; content: NormalizedEntry }
  | { type: 'STDOUT'; content: string }
  | { type: 'STDERR'; content: string }
  | { type: 'DIFF'; content: Diff }

// Helper type to add common fields to each PatchType variant
type PatchTypeBase = {
  patchKey: string
  executionProcessId: string
}

export type PatchTypeWithKey =
  | ({ type: 'NORMALIZED_ENTRY'; content: NormalizedEntry } & PatchTypeBase)
  | ({ type: 'STDOUT'; content: string } & PatchTypeBase)
  | ({ type: 'STDERR'; content: string } & PatchTypeBase)
  | ({ type: 'DIFF'; content: Diff } & PatchTypeBase)
