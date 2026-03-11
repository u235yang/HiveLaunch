'use client'

import { Info, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatSystemMessageProps {
  content: string
  expanded?: boolean
  onToggle?: () => void
  className?: string
}

export function ChatSystemMessage({
  content,
  expanded = false,
  onToggle,
  className,
}: ChatSystemMessageProps) {
  const multiline = content.includes('\n')

  return (
    <div
      className={cn(
        'flex items-start gap-2 text-sm text-gray-500',
        onToggle && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1',
        className
      )}
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <span
        className={cn(
          'flex-1',
          !expanded && 'truncate',
          expanded && 'whitespace-pre-wrap break-all'
        )}
      >
        {content}
      </span>
      {onToggle && multiline && (
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 transition-transform',
            !expanded && '-rotate-90'
          )}
        />
      )}
    </div>
  )
}
