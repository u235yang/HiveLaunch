'use client'

import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolStatus } from './types'
import { ToolStatusDot } from './ToolStatusDot'

export interface AggregatedEntry {
  summary: string
  status?: ToolStatus
  expansionKey: string
}

interface ChatAggregatedToolEntriesProps {
  entries: AggregatedEntry[]
  expanded: boolean
  isHovered: boolean
  onToggle: () => void
  onHoverChange: (hovered: boolean) => void
  label: string
  unit: string
  icon?: React.ElementType
  className?: string
  onViewContent?: (index: number) => void
}

export function ChatAggregatedToolEntries({
  entries,
  expanded,
  isHovered,
  onToggle,
  onHoverChange,
  label,
  unit,
  icon: Icon = Search,
  className,
  onViewContent,
}: ChatAggregatedToolEntriesProps) {
  if (entries.length === 0) return null

  // If only one entry, don't aggregate
  if (entries.length === 1) {
    const entry = entries[0]
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-gray-500',
          onViewContent && 'cursor-pointer hover:text-gray-700',
          className
        )}
        onClick={onViewContent ? () => onViewContent(0) : undefined}
        role={onViewContent ? 'button' : undefined}
      >
        <span className="relative shrink-0 pt-0.5">
          <Icon className="w-4 h-4" />
          {entry.status && (
            <ToolStatusDot
              status={entry.status}
              className="absolute -bottom-0.5 -left-0.5"
            />
          )}
        </span>
        <span className="truncate">{entry.summary}</span>
      </div>
    )
  }

  // Get the worst status among all entries for the aggregate indicator
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
            <Icon className="w-4 h-4" />
          )}
          {aggregateStatus && (
            <ToolStatusDot
              status={aggregateStatus}
              className="absolute -bottom-0.5 -left-0.5"
            />
          )}
        </span>
        <span className="truncate">
          {label} · {entries.length} {entries.length === 1 ? unit : `${unit}s`}
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
                onViewContent && 'cursor-pointer hover:text-gray-700'
              )}
              onClick={onViewContent ? () => onViewContent(index) : undefined}
              role={onViewContent ? 'button' : undefined}
            >
              <span className="relative shrink-0 pt-0.5">
                <Icon className="w-4 h-4" />
                {entry.status && (
                  <ToolStatusDot
                    status={entry.status}
                    className="absolute -bottom-0.5 -left-0.5"
                  />
                )}
              </span>
              <span className="truncate">{entry.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
