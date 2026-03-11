'use client'

import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatErrorMessageProps {
  content: string
  expanded?: boolean
  onToggle?: () => void
  className?: string
}

export function ChatErrorMessage({
  content,
  expanded = false,
  onToggle,
  className,
}: ChatErrorMessageProps) {
  const multiline = content.includes('\n')

  return (
    <div
      className={cn(
        'flex items-start gap-2 text-sm text-red-600 dark:text-red-400',
        onToggle && 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20 rounded p-1',
        className
      )}
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
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
