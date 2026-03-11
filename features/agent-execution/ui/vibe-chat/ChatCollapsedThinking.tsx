'use client'

import { MessageSquareMore, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatMarkdown } from './ChatMarkdown'

export interface ThinkingEntry {
  content: string
  expansionKey: string
}

interface ChatCollapsedThinkingProps {
  entries: ThinkingEntry[]
  expanded: boolean
  isHovered: boolean
  onToggle: () => void
  onHoverChange: (hovered: boolean) => void
  className?: string
  taskAttemptId?: string
}

export function ChatCollapsedThinking({
  entries,
  expanded,
  isHovered,
  onToggle,
  onHoverChange,
  className,
  taskAttemptId,
}: ChatCollapsedThinkingProps) {
  if (entries.length === 0) return null

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header row */}
      <div
        className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer group"
        onClick={onToggle}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        role="button"
        aria-expanded={expanded}
      >
        <span className="shrink-0 pt-0.5">
          {isHovered ? (
            <ChevronRight
              className={cn(
                'w-4 h-4 transition-transform duration-150',
                expanded && 'rotate-90'
              )}
            />
          ) : (
            <MessageSquareMore className="w-4 h-4" />
          )}
        </span>
        <span className="truncate">思考 ({entries.length} 条)</span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="ml-6 pt-1 flex flex-col gap-2">
          {entries.map((entry) => (
            <div key={entry.expansionKey} className="text-sm text-gray-500 pl-2 border-l-2 border-gray-200">
              <ChatMarkdown
                content={entry.content}
                workspaceId={taskAttemptId}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
