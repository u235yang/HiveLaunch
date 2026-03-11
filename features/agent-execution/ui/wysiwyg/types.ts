import type { EditorState } from 'lexical'
import type { BaseCodingAgent, SendMessageShortcut } from '@shared/types'

/** Markdown string representing the editor content */
export type SerializedEditorState = string

export interface WysiwygProps {
  /** Placeholder text */
  placeholder?: string
  /** Markdown string representing the editor content */
  value: SerializedEditorState
  /** Called when content changes */
  onChange?: (markdown: SerializedEditorState) => void
  /** Called when editor state changes */
  onEditorStateChange?: (state: EditorState) => void
  /** Whether the editor is disabled */
  disabled?: boolean
  /** Additional CSS class */
  className?: string
  /** Agent type for slash command support - now accepts any string */
  agent?: string | null  // 🔹 修改：支持任意字符串类型
  /** Workspace ID for slash commands */
  workspaceId?: string
  /** Called when Cmd+Enter is pressed (send message) */
  onSend?: () => void
  /** Keyboard shortcut for sending messages */
  sendShortcut?: SendMessageShortcut
  /** Auto-focus the editor on mount */
  autoFocus?: boolean
}

/** Ref interface for WysiwygEditor */
export interface WysiwygEditorRef {
  /** Focus the editor */
  focus: () => void
}
