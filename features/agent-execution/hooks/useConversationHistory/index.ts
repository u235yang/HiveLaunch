// Re-export types for backward compatibility
export type {
  AddEntryType,
  OnEntriesUpdated,
  PatchTypeWithKey,
  DisplayEntry,
  AggregatedPatchGroup,
  AggregatedDiffGroup,
  AggregatedThinkingGroup,
  ExecutionProcessStateStore,
} from './types'

// Re-export constants
export {
  MIN_INITIAL_ENTRIES,
  REMAINING_BATCH_SIZE,
  makeLoadingPatch,
  nextActionPatch,
} from './constants'

// Re-export the canonical hook
export { useConversationHistory } from './useConversationHistory'
