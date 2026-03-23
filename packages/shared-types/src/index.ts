// Shared type definitions for HiveLaunch

// ========== Task ==========
export type TaskStatus = 'todo' | 'inprogress' | 'pending' | 'done' | 'cancelled'
export type TaskType = 'normal' | 'direct'

export interface Task {
  id: string
  project_id: string
  title: string | null
  description: string
  status: TaskStatus
  task_type: TaskType
  active_workspace_id?: string
  active_session_id?: string
  last_attempt_summary?: string
  attempt_count?: number
  direct_branch?: string
  agent_cli?: string
  model_id?: string
  position?: number
  created_at: string
  updated_at: string
}

export interface TaskWithAttemptStatus extends Task {
  has_in_progress_attempt: boolean
  last_attempt_failed: boolean
  agent_profile: AgentProfile
}

// ========== Project ==========
export interface Project {
  id: string
  name: string
  description?: string
  repo_path: string
  target_branch: string
  created_at: string
  updated_at: string
}

// ========== Agent Profile (保留用于 Task 绑定) ==========

// ========== Agent ==========
export type CodingCLI = 'OPENCODE'

export interface AgentProfile {
  cli: CodingCLI
  agent: string
}

// ========== Workspace ==========
export interface Workspace {
  id: string
  task_id: string
  branch: string
  role?: 'primary' | 'retry' | 'fork'
  agent_working_dir?: string
  setup_completed_at?: string
  archived: boolean
  pinned: boolean
  created_at: string
  updated_at: string
}

// ========== Session ==========
export interface Session {
  id: string
  workspace_id: string
  agent_profile: AgentProfile
  status: 'running' | 'inreview' | 'closed' | 'failed'
  attempt_no: number
  parent_session_id?: string | null
  created_at: string
  updated_at: string
}

// ========== Execution Process ==========
export type ExecutionProcessStatus = 'running' | 'completed' | 'failed' | 'killed'

export interface ExecutionProcess {
  id: string
  session_id: string
  run_reason: 'codingagent' | 'setupscript' | 'cleanupscript' | 'devserver'
  status: ExecutionProcessStatus
  exit_code?: number
  started_at: string
  completed_at?: string
}

// ========== Swarm Configuration ==========
export interface SwarmTemplate {
  id: string
  name: string
  description: string
  cli: 'opencode' | 'claude-code' | 'gemini-cli'
  version: string
  config: {
    ohMyOpencode: Record<string, unknown>
    mcp: Record<string, unknown>
    skills: string[]
  }
}

export interface ProjectSwarm {
  id: string
  templateId: string
  name: string
  installedAt: Date
  version: string
  overrides?: {
    ohMyOpencode?: Record<string, unknown>
    mergeStrategy: 'override' | 'merge' | 'readonly'
  }
}

// ========== Token Usage ==========
export interface TokenUsageEntry {
  type: 'token_usage_info'
  input_tokens: number
  output_tokens: number
  total_tokens: number
  model: string
  model_context_window: number
  thinking_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  timestamp: string
}

export interface TokenUsageSummary {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  thinking_tokens: number
  model_breakdown: Record<string, number>
  agent_breakdown: Record<string, number>
  first_usage: string
  last_usage: string
  entry_count: number
}

// ========== Agent Execution Stream ==========
export type StreamEntryType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_use'
  | 'tool_result'
  | 'error_message'
  | 'system_message'
  | 'typing_indicator'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'execution_stopped'

export interface StreamEntry {
  id: string
  type: StreamEntryType
  timestamp: string
  content?: string
}

export interface UserMessageEntry extends StreamEntry {
  type: 'user_message'
  content: string
  attachments?: Array<{
    id: string
    name: string
    type: 'file' | 'image' | 'code'
    content?: string
  }>
}

export interface AssistantMessageEntry extends StreamEntry {
  type: 'assistant_message'
  content: string
  tool_calls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
}

export interface ToolUseEntry extends StreamEntry {
  type: 'tool_use'
  tool_name: string
  tool_call_id: string
  status: 'started' | 'completed' | 'failed'
  parameters?: Record<string, unknown>
  output?: string
}

export interface ErrorMessageEntry extends StreamEntry {
  type: 'error_message'
  message: string
  code?: string
  recoverable: boolean
}

export interface SystemMessageEntry extends StreamEntry {
  type: 'system_message'
  message: string
  level: 'info' | 'warning' | 'error'
}

export interface TypingIndicatorEntry extends StreamEntry {
  type: 'typing_indicator'
  agent_name: string
}

export interface ExecutionStartedEntry extends StreamEntry {
  type: 'execution_started'
  session_id: string
  agent_name: string
}

export interface ExecutionCompletedEntry extends StreamEntry {
  type: 'execution_completed'
  session_id: string
  duration_ms: number
  summary?: string
}

export interface ExecutionFailedEntry extends StreamEntry {
  type: 'execution_failed'
  session_id: string
  reason: string
  error?: string
}

export interface ExecutionStoppedEntry extends StreamEntry {
  type: 'execution_stopped'
  session_id: string
  stopped_by: string
}

export type StreamMessage =
  | UserMessageEntry
  | AssistantMessageEntry
  | ToolUseEntry
  | ErrorMessageEntry
  | SystemMessageEntry
  | TypingIndicatorEntry
  | ExecutionStartedEntry
  | ExecutionCompletedEntry
  | ExecutionFailedEntry
  | ExecutionStoppedEntry

// ========== Slash Commands & Agent Types ==========
export type BaseCodingAgent =
  | 'OPENCODE'
  | 'CLAUDE_CODE'
  | 'CURSOR'
  | 'QWEN'
  | 'COPILOT'
  | 'DROID'
  | 'AMP'
  | 'GEMINI'

export interface SlashCommandDescription {
  /** Command name without the leading slash, e.g. `help` for `/help` */
  name: string
  description?: string | null
}

export type SendMessageShortcut = 'ModifierEnter' | 'Enter'

export interface AgentInfo {
  id: string
  label: string  // 🔹 修改：name → label（与后端 ExecutorAgentInfo 一致）
  description?: string  // 🔹 修改：添加 ? 使其可选（与后端一致）
  capabilities?: string[]  // 🔹 修改：添加 ? 使其可选
  is_default?: boolean  // 🔹 新增：是否为默认 agent
  is_available?: boolean  // 🔹 修改：添加 ? 使其可选
}

// ========== Model Selector Types ==========
export interface ModelProvider {
  /** Provider identifier */
  id: string
  /** Display name */
  name: string
}

export interface ReasoningOption {
  id: string
  label: string
  is_default: boolean
}

export interface ModelInfo {
  /** Model identifier */
  id: string
  /** Display name */
  name: string
  /** Provider this model belongs to */
  provider_id?: string
  /** Configurable reasoning options if supported */
  reasoning_options: ReasoningOption[]
}

export type PermissionPolicy = 'AUTO' | 'SUPERVISED' | 'PLAN'

export interface ModelSelectorConfig {
  /** Available providers */
  providers: ModelProvider[]
  /** Available models */
  models: ModelInfo[]
  /** Global default model (format: provider_id/model_id) */
  default_model: string | null
  /** Available agents */
  agents: AgentInfo[]
  /** Supported permission policies */
  permissions: PermissionPolicy[]
}

// ========== Executor Discovered Options ==========
export interface ExecutorDiscoveredOptions {
  /** Model selector configuration */
  model_selector: ModelSelectorConfig
  /** Available slash commands */
  slash_commands: SlashCommandDescription[]
  /** Whether models are still being discovered */
  loading_models: boolean
  /** Whether agents are still being discovered */
  loading_agents: boolean
  /** Whether slash commands are still being discovered */
  loading_slash_commands: boolean
  /** Error message if discovery failed */
  error: string | null
}

// ========== Git Conflict Types ==========
export type ConflictOp = 'rebase' | 'merge' | 'cherry_pick' | 'revert'

export interface BranchStatus {
  commits_ahead: number
  commits_behind: number
  has_uncommitted_changes: boolean
  conflicted_files: string[]
  current_branch: string
  is_rebase_in_progress: boolean
  is_merge_in_progress: boolean
  conflict_op: ConflictOp | null
  target_branch: string
}
