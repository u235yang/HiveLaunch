// F3: Agent Execution Hooks

// Legacy hooks - DELETED (use V2 instead)
// export * from './useAgentStream'      - DELETED
// export * from './useWorkspaceManager' - DELETED
// export * from './useTaskExecution'    - DELETED

// Generic utility hooks (still available)
export * from './useCommit'
export * from './useBranches'
export * from './useForcePush'
export * from './useProjectBranches'

// V2 hooks (vibe-kanban architecture)
export { useJsonPatchWsStream } from './useJsonPatchWsStream'
export { useExecutionProcesses } from './useExecutionProcesses'
export { useCreateSession } from './useCreateSession'
export { useSessionSend } from './useSessionSend'
export { useFollowUpSend } from './useFollowUpSend'
export { useTaskExecutionV2 } from './useTaskExecutionV2'
// Unified executor discovery hook (vibe-kanban style)
export { useExecutorDiscovery } from './useExecutorDiscovery'

// Conversation history hooks
export { useConversationHistory } from './useConversationHistory'
export type {
  AddEntryType,
  OnEntriesUpdated,
  PatchTypeWithKey,
  DisplayEntry,
  AggregatedPatchGroup,
  AggregatedDiffGroup,
  AggregatedThinkingGroup,
  ExecutionProcessStateStore,
} from './useConversationHistory'

// Git hooks (TanStack Query based)
export { useGitBranchStatus } from './useGitBranchStatus'
export type { BranchStatus } from './useGitBranchStatus'
export { useGitDiffs } from './useGitDiffs'
export type { FileDiff } from './useGitDiffs'

// Git operation hooks (merge, push, rebase)
export { useGitMerge } from './useGitMerge'
export { useGitPush } from './useGitPush'
export { useGitPull } from './useGitPull'
export { useGitRebase } from './useGitRebase'
export type { GitOperationError } from './useGitMerge'
export { useWorktreeFiles, useWorktreeFilePreview } from './useWorktreeFiles'
