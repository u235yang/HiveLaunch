'use client'

import { Pencil, RotateCcw } from 'lucide-react'
import { useUIStore } from '@/features/shared/store'
import { ChatEntryContainer } from './ChatEntryContainer'
import { ChatMarkdown } from './ChatMarkdown'

interface ChatUserMessageProps {
  content: string
  expanded?: boolean
  onToggle?: () => void
  className?: string
  workspaceId?: string
  onEdit?: () => void
  onReset?: () => void
  isGreyed?: boolean
}

export function ChatUserMessage({
  content,
  expanded = true,
  onToggle,
  className,
  workspaceId,
  onEdit,
  onReset,
  isGreyed,
}: ChatUserMessageProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const headerActions =
    !isGreyed && (onEdit || onReset) ? (
      <div className="flex items-center gap-1">
        {onReset && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReset()
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label={txt('重置', 'Reset')}
            title={txt('重置', 'Reset')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label={txt('编辑', 'Edit')}
            title={txt('编辑', 'Edit')}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    ) : undefined

  return (
    <ChatEntryContainer
      variant="user"
      title={txt('你', 'You')}
      expanded={expanded}
      onToggle={onToggle}
      className={className}
      isGreyed={isGreyed}
      headerRight={headerActions}
    >
      <ChatMarkdown content={content} workspaceId={workspaceId} />
    </ChatEntryContainer>
  )
}
