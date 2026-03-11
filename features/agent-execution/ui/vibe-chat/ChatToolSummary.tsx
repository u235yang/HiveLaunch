'use client'

import { forwardRef } from 'react'
import {
  Search,
  Terminal,
  FileText,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolStatus } from './types'
import { ToolStatusDot } from './ToolStatusDot'

interface ChatToolSummaryProps {
  summary: string
  className?: string
  expanded?: boolean
  onToggle?: () => void
  status?: ToolStatus
  onViewContent?: () => void
  toolName?: string
  isTruncated?: boolean
  actionType?: string
}

export const ChatToolSummary = forwardRef<
  HTMLSpanElement,
  ChatToolSummaryProps
>(function ChatToolSummary(
  {
    summary,
    className,
    expanded,
    onToggle,
    status,
    onViewContent,
    toolName,
    isTruncated,
    actionType,
  },
  ref
) {
  const canExpand = isTruncated && onToggle
  const isClickable = Boolean(onViewContent || canExpand)

  const handleClick = () => {
    if (onViewContent) {
      onViewContent()
    } else if (canExpand) {
      onToggle()
    }
  }

  // Determine icon based on action type or tool name
  const getIcon = () => {
    if (toolName === 'Bash') return Terminal
    switch (actionType) {
      case 'file_read':
        return FileText
      case 'search':
        return Search
      case 'web_fetch':
        return Globe
      default:
        return Search
    }
  }
  const Icon = getIcon()

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm text-gray-500',
        isClickable && 'cursor-pointer hover:text-gray-700',
        className
      )}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
    >
      <span className="relative shrink-0 pt-0.5">
        <Icon className="w-4 h-4" />
        {status && (
          <ToolStatusDot
            status={status}
            className="absolute -bottom-0.5 -left-0.5"
          />
        )}
      </span>
      <span
        ref={ref}
        className={cn(
          !expanded && 'truncate',
          expanded && 'whitespace-pre-wrap break-all'
        )}
      >
        {summary}
      </span>
    </div>
  )
})
