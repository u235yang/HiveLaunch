// F1: Kanban Board UI Components

// 从 apps/web/components/kanban 重新导出（因为使用了 @dnd-kit）
export { KanbanBoard } from '../../../apps/web/components/kanban/KanbanBoard'
export { KanbanColumn } from '../../../apps/web/components/kanban/KanbanColumn'
export { TaskCard, getStatusLabel, getStatusColors, DragOverlayCard } from '../../../apps/web/components/kanban/TaskCard'

export { KanbanBoardHeader } from './KanbanBoardHeader'
export { default as CreateProjectModal } from './CreateProjectModalSimple'

// Types
export type { Task, TaskStatus } from '../../../apps/web/components/kanban/TaskCard'

// Re-export all kanban types from features/kanban/types
export * from '../types'
