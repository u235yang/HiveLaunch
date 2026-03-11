'use client'

import { File, ChevronDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'
import type { ToolStatus } from './types'
import { ToolStatusDot } from './ToolStatusDot'

interface ChatFileEntryProps {
  filename: string
  additions?: number
  deletions?: number
  expanded?: boolean
  onToggle?: () => void
  className?: string
  status?: ToolStatus
  diffContent?: string
  onOpenInChanges?: () => void
}

export function ChatFileEntry({
  filename,
  additions,
  deletions,
  expanded = false,
  onToggle,
  className,
  status,
  diffContent,
  onOpenInChanges,
}: ChatFileEntryProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const hasStats = additions !== undefined || deletions !== undefined
  const isDenied = status?.status === 'denied'
  const hasDiffContent = diffContent && diffContent.length > 0

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        isDenied ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-gray-200 bg-white dark:bg-gray-900',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center p-2 w-full',
          isDenied ? 'bg-red-100 dark:bg-red-950/30' : 'bg-gray-50 dark:bg-gray-800',
          onToggle && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'
        )}
        onClick={onToggle}
      >
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="relative shrink-0">
            <File className="w-4 h-4 text-gray-500" />
            {status && (
              <ToolStatusDot
                status={status}
                className="absolute -bottom-0.5 -right-0.5"
              />
            )}
          </span>
          <span className="text-sm text-gray-800 dark:text-gray-200 truncate font-mono">
            {filename}
          </span>
          {onOpenInChanges && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenInChanges()
              }}
              className="shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 transition-colors"
              title={txt('在 Changes 面板中查看', 'View in Changes panel')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {hasStats && (
            <span className="text-sm shrink-0">
              {additions !== undefined && additions > 0 && (
                <span className="text-emerald-600">+{additions}</span>
              )}
              {additions !== undefined && deletions !== undefined && ' '}
              {deletions !== undefined && deletions > 0 && (
                <span className="text-red-600">-{deletions}</span>
              )}
            </span>
          )}
        </div>
        {onToggle && (
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-gray-500 transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Diff body - shown when expanded */}
      {hasDiffContent && expanded && (
        <div className="p-3 bg-gray-900 rounded-b-lg">
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto">
            {diffContent}
          </pre>
        </div>
      )}
    </div>
  )
}
