'use client'

import { File, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'
import type { ToolStatus } from './types'
import { ToolStatusDot } from './ToolStatusDot'

export interface DiffEntry {
  filename: string
  additions?: number
  deletions?: number
  status?: ToolStatus
  expansionKey: string
  diffContent?: string
}

interface ChatAggregatedDiffEntriesProps {
  entries: DiffEntry[]
  expanded: boolean
  isHovered: boolean
  onToggle: () => void
  onHoverChange: (hovered: boolean) => void
  className?: string
  onViewFile?: (index: number) => void
}

export function ChatAggregatedDiffEntries({
  entries,
  expanded,
  isHovered,
  onToggle,
  onHoverChange,
  className,
  onViewFile,
}: ChatAggregatedDiffEntriesProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  if (entries.length === 0) return null

  // If only one entry, don't aggregate
  if (entries.length === 1) {
    const entry = entries[0]
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-gray-500',
          onViewFile && 'cursor-pointer hover:text-gray-700',
          className
        )}
        onClick={onViewFile ? () => onViewFile(0) : undefined}
        role={onViewFile ? 'button' : undefined}
      >
        <span className="relative shrink-0 pt-0.5">
          <File className="w-4 h-4" />
          {entry.status && (
            <ToolStatusDot
              status={entry.status}
              className="absolute -bottom-0.5 -left-0.5"
            />
          )}
        </span>
        <span className="truncate font-mono">{entry.filename}</span>
        {(entry.additions !== undefined || entry.deletions !== undefined) && (
          <span className="text-xs shrink-0">
            {entry.additions !== undefined && entry.additions > 0 && (
              <span className="text-emerald-600">+{entry.additions}</span>
            )}
            {entry.deletions !== undefined && entry.deletions > 0 && (
              <span className="text-red-600"> -{entry.deletions}</span>
            )}
          </span>
        )}
      </div>
    )
  }

  // Calculate total additions and deletions
  const totalAdditions = entries.reduce((sum, e) => sum + (e.additions || 0), 0)
  const totalDeletions = entries.reduce((sum, e) => sum + (e.deletions || 0), 0)

  // Get the worst status among all entries
  const aggregateStatus = entries.reduce<ToolStatus | undefined>(
    (worst, entry) => {
      if (!entry.status) return worst
      if (!worst) return entry.status

      const statusPriority: Record<string, number> = {
        failed: 6,
        denied: 5,
        timed_out: 4,
        pending_approval: 3,
        created: 2,
        success: 1,
      }

      const worstPriority = statusPriority[worst.status] || 0
      const currentPriority = statusPriority[entry.status.status] || 0

      return currentPriority > worstPriority ? entry.status : worst
    },
    undefined
  )

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
        <span className="relative shrink-0 pt-0.5">
          {isHovered ? (
            <ChevronRight
              className={cn(
                'w-4 h-4 transition-transform duration-150',
                expanded && 'rotate-90'
              )}
            />
          ) : (
            <File className="w-4 h-4" />
          )}
          {aggregateStatus && (
            <ToolStatusDot
              status={aggregateStatus}
              className="absolute -bottom-0.5 -left-0.5"
            />
          )}
        </span>
        <span className="truncate">
          {txt('编辑', 'Edited')} · {entries.length} {txt('个文件', 'files')}
        </span>
        <span className="text-xs shrink-0">
          {totalAdditions > 0 && (
            <span className="text-emerald-600">+{totalAdditions}</span>
          )}
          {totalDeletions > 0 && (
            <span className="text-red-600"> -{totalDeletions}</span>
          )}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="ml-6 pt-1 flex flex-col gap-0.5">
          {entries.map((entry, index) => (
            <div
              key={entry.expansionKey}
              className={cn(
                'flex items-center gap-2 text-sm text-gray-500 pl-2',
                onViewFile && 'cursor-pointer hover:text-gray-700'
              )}
              onClick={onViewFile ? () => onViewFile(index) : undefined}
              role={onViewFile ? 'button' : undefined}
            >
              <span className="relative shrink-0 pt-0.5">
                <File className="w-4 h-4" />
                {entry.status && (
                  <ToolStatusDot
                    status={entry.status}
                    className="absolute -bottom-0.5 -left-0.5"
                  />
                )}
              </span>
              <span className="truncate font-mono">{entry.filename}</span>
              {(entry.additions !== undefined || entry.deletions !== undefined) && (
                <span className="text-xs shrink-0">
                  {entry.additions !== undefined && entry.additions > 0 && (
                    <span className="text-emerald-600">+{entry.additions}</span>
                  )}
                  {entry.deletions !== undefined && entry.deletions > 0 && (
                    <span className="text-red-600"> -{entry.deletions}</span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
