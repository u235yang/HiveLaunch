// vibe-chat components
// Agent conversation UI components based on vibe-kanban design

// Types
export * from './types'

// Core components
export { VibeThread } from './VibeThread'
export { VirtualizedChatList } from './VirtualizedChatList'
export { NormalizedEntryRenderer } from './NormalizedEntryRenderer'

// Hooks
export { useVibeThread } from './useVibeThread'

// Message components
export { ChatUserMessage } from './ChatUserMessage'
export { ChatAssistantMessage } from './ChatAssistantMessage'
export { ChatSystemMessage } from './ChatSystemMessage'
export { ChatErrorMessage } from './ChatErrorMessage'
export { ChatThinkingMessage } from './ChatThinkingMessage'
export { ChatMarkdown } from './ChatMarkdown'

// Tool components
export { ChatToolSummary } from './ChatToolSummary'
export { ChatTodoList } from './ChatTodoList'
export { ChatFileEntry } from './ChatFileEntry'
export { ChatScriptEntry } from './ChatScriptEntry'
export { ChatSubagentEntry } from './ChatSubagentEntry'
export { ChatApprovalCard } from './ChatApprovalCard'

// Aggregated components
export { ChatAggregatedToolEntries } from './ChatAggregatedToolEntries'
export type { AggregatedEntry } from './ChatAggregatedToolEntries'
export { ChatAggregatedDiffEntries } from './ChatAggregatedDiffEntries'
export type { DiffEntry } from './ChatAggregatedDiffEntries'
export { ChatCollapsedThinking } from './ChatCollapsedThinking'
export type { ThinkingEntry } from './ChatCollapsedThinking'

// Container components
export { ChatEntryContainer } from './ChatEntryContainer'

// Utility components
export { ToolStatusDot } from './ToolStatusDot'
