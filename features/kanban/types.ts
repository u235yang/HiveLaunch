// F1: Kanban Types - 看板系统类型定义

// ========== 任务状态 ==========
export type TaskStatus = 'todo' | 'inprogress' | 'pending' | 'done' | 'cancelled'

// ========== 任务 ==========
export interface Task {
  id: string
  projectId: string
  title: string | null
  description: string
  status: TaskStatus
  hasInProgressAttempt?: boolean
  lastAttemptFailed?: boolean
  lastAttemptSummary?: string
  attemptCount?: number
  // Agent配置
  agentCli: string
  modelId?: string | null
  // 排序位置
  position?: number
  createdAt: string
  updatedAt: string
}

// ========== 项目 ==========
export interface Project {
  id: string
  name: string
  description?: string
  createdAt?: string
  updatedAt?: string
}

// ========== Agent ==========
export interface AgentProfile {
  cli: string
  agent: string
}

// ========== 看板列 ==========
export interface KanbanColumn {
  id: TaskStatus
  title: string
  taskIds: string[]
}

// 看板列配置
export interface ColumnConfig {
  title: string
  dotColor: string
  bgColor: string
  badgeBg: string
  badgeText: string
}

// ========== 成员 ==========
export interface Member {
  id: string
  name: string
  avatar?: string
  initials?: string
  color?: string
}

// ========== Workspace (执行会话) ==========
export interface Workspace {
  id: string
  taskId: string
  branch: string
  agentWorkingDir?: string
  setupCompletedAt?: string
  archived: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
}

// ========== 会话 ==========
export interface Session {
  id: string
  workspaceId: string
  agentProfile: AgentProfile
  status: 'running' | 'inreview' | 'closed' | 'failed'
  attemptNo: number
  parentSessionId?: string | null
  createdAt: string
  updatedAt: string
}

// ========== 任务扩展类型 (运行时计算) ==========
export interface TaskWithAttemptStatus extends Task {
  agentProfile: AgentProfile
}

// 看板列数据
export type KanbanColumns = Record<TaskStatus, TaskWithAttemptStatus[]>

// ========== 筛选器 ==========
export interface TaskFilter {
  status?: TaskStatus[]
  agent?: string[]
  searchQuery?: string
  dateRange?: {
    start: string
    end: string
  }
}
