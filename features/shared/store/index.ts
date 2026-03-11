/**
 * Shared Store Index
 *
 * Unified export for all Zustand stores.
 * Import stores from this file to ensure consistent access patterns.
 */

// Project Store
export {
  useProjectStore,
  type Project,
  type CreateProjectInput,
  type UpdateProjectInput,
  projectSelectors,
} from './projectStore'

// Task Store
export {
  useTaskStore,
  type Task,
  type TaskStatus,
  type CreateTaskInput,
  type UpdateTaskInput,
  type MoveTaskInput,
  type DragState,
  taskSelectors,
} from './taskStore'

// Swarm Store
export {
  useSwarmStore,
  type SwarmAgent,
  type SwarmConfig,
  type CreateSwarmInput,
  type UpdateSwarmInput,
  swarmSelectors,
} from './swarmStore'

// Token Store
export {
  useTokenStore,
  type TokenUsageRecord,
  type TokenSummary,
  type TokenStats,
  type TokenFilters,
  tokenSelectors,
} from './tokenStore'

// UI Store
export { useUIStore, uiSelectors, type ThemeMode } from './uiStore'

/**
 * Store naming conventions for devtools:
 * - ProjectStore: 'project-store'
 * - TaskStore: 'task-store'
 * - WorkspaceStore: 'WorkspaceStore'
 * - SwarmStore: 'SwarmStore'
 * - TokenStore: 'TokenStore'
 * - UIStore: 'UIStore'
 */
