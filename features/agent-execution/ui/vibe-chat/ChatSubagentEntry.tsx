'use client'

import { useMemo } from 'react'
import {
  ChevronDown,
  Cpu,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'
import type { ToolStatus, ToolResult } from './types'
import { ChatMarkdown } from './ChatMarkdown'

interface ChatSubagentEntryProps {
  description: string
  subagentType?: string | null
  result?: ToolResult | null
  expanded?: boolean
  onToggle?: () => void
  className?: string
  status?: ToolStatus
  workspaceId?: string
}

export function ChatSubagentEntry({
  description,
  subagentType,
  result,
  expanded = false,
  onToggle,
  className,
  status,
  workspaceId,
}: ChatSubagentEntryProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  // Determine status icon
  const StatusIcon = useMemo(() => {
    if (!status) return null
    const statusType = status.status

    const isSuccess = statusType === 'success'
    const isError =
      statusType === 'failed' ||
      statusType === 'denied' ||
      statusType === 'timed_out'
    const isPending =
      statusType === 'created' || statusType === 'pending_approval'

    if (isSuccess) {
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
    }
    if (isError) {
      return <XCircle className="w-3.5 h-3.5 text-red-500" />
    }
    if (isPending) {
      return <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
    }
    return null
  }, [status])

  // Determine if status is an error state
  const isErrorStatus = useMemo(() => {
    if (!status) return false
    return (
      status.status === 'failed' ||
      status.status === 'denied' ||
      status.status === 'timed_out'
    )
  }, [status])

  // Format the subagent type for display
  const formattedType = useMemo(() => {
    if (!subagentType) return txt('子 Agent', 'Sub Agent')
    return subagentType.charAt(0).toUpperCase() + subagentType.slice(1)
  }, [subagentType, txt])

  // Extract the result content for display
  const resultContent = useMemo(() => {
    if (!result?.value) return null

    if (typeof result.value === 'string') {
      return result.value
    }

    return JSON.stringify(result.value, null, 2)
  }, [result])

  const hasContent = Boolean(resultContent)

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        isErrorStatus && 'border-red-300 bg-red-50 dark:bg-red-950/20',
        status?.status === 'success' && 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20',
        !isErrorStatus && status?.status !== 'success' && 'border-gray-200',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center px-4 py-2 gap-2',
          isErrorStatus && 'bg-red-100 dark:bg-red-950/30',
          status?.status === 'success' && 'bg-emerald-100 dark:bg-emerald-950/30',
          onToggle && hasContent && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
        onClick={hasContent ? onToggle : undefined}
      >
        <span className="relative shrink-0">
          <Cpu className="w-4 h-4 text-gray-500" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {formattedType}
            </span>
            {StatusIcon}
          </div>
          <span className="text-sm text-gray-800 dark:text-gray-200 truncate block">
            {description}
          </span>
        </div>
        {onToggle && hasContent && (
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-gray-500 transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Expanded content */}
      {expanded && hasContent && (
        <div className="border-t border-gray-200 p-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-xs font-medium text-gray-500 pb-2 uppercase tracking-wide">
            {txt('输出', 'Output')}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ChatMarkdown content={resultContent!} workspaceId={workspaceId} />
          </div>
        </div>
      )}
    </div>
  )
}
