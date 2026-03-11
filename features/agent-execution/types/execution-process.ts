/**
 * Execution Process Types
 * Adapted from vibe-kanban for bee-kanban
 */

export type ExecutionProcessStatus = 'running' | 'completed' | 'failed' | 'killed'

export type ExecutionProcessRunReason =
  | 'setupscript'
  | 'cleanupscript'
  | 'archivescript'
  | 'codingagent'
  | 'devserver'

/**
 * Execution Process - represents a single execution run within a session
 * Using snake_case to match backend API response
 */
export interface ExecutionProcess {
  id: string
  session_id: string
  run_reason: ExecutionProcessRunReason
  executor_action?: ExecutionProcessExecutorAction | null
  status: ExecutionProcessStatus
  exit_code: number | null
  /** dropped: true if this process is excluded from current history view */
  dropped: boolean
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Session - groups execution processes within a workspace
 */
export interface Session {
  id: string
  workspaceId: string
  executor: string | null
  workingDir?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Create Follow-up Attempt Request
 */
export interface CreateFollowUpAttempt {
  prompt: string
  executorProfileId: {
    executor: BaseCodingAgent
    variant: string | null
  }
  /** 🔹 用户选择的 agent ID (如 plan, sisyphus, build) */
  agent?: string
  /** 模型 ID (如 anthropic/claude-3.5-sonnet) */
  model?: string
  imageIds?: string[]
  retryProcessId: string | null
  forceWhenDirty: boolean | null
  performGitReset: boolean | null
}

/**
 * Base Coding Agent Types
 */
export type BaseCodingAgent =
  | 'opencode'
  | 'claude-code'
  | 'claude'
  | 'gemini'
  | 'qwen'
  | 'cursor'
  | 'copilot'
  | 'droid'
  | 'amp'
  | 'codex'

/**
 * Executor Profile ID
 */
export interface ExecutorProfileId {
  executor: BaseCodingAgent
  variant: string | null
}

export type ExecutionProcessExecutorActionType =
  | {
      type: 'CodingAgentInitialRequest'
      prompt: string
      executor_profile_id?: ExecutorProfileId
      working_dir?: string | null
    }
  | {
      type: 'CodingAgentFollowUpRequest'
      prompt: string
      session_id: string
      reset_to_message_id?: string | null
      executor_profile_id?: ExecutorProfileId
      working_dir?: string | null
    }
  | {
      type: 'ScriptRequest'
      script: string
      language?: string
      context?: string
      working_dir?: string | null
    }
  | {
      type: 'ReviewRequest'
      prompt: string
    }

export interface ExecutionProcessExecutorAction {
  typ: ExecutionProcessExecutorActionType
  next_action: ExecutionProcessExecutorAction | null
}

/**
 * Execution Process State for WebSocket streaming
 * Note: JSON Patch path uses camelCase (/executionProcesses), so we use camelCase here
 */
export interface ExecutionProcessState {
  executionProcesses: Record<string, ExecutionProcess>
}
