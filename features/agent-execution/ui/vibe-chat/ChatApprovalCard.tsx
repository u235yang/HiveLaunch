'use client'

import { Check, X } from 'lucide-react'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatEntryContainer } from './ChatEntryContainer'
import type { ToolStatus } from './types'

interface ChatApprovalCardProps {
  title: string
  content: string
  expanded?: boolean
  onToggle?: () => void
  className?: string
  workspaceId?: string
  status: ToolStatus
  onApprove?: () => void
  onDeny?: () => void
}

export function ChatApprovalCard({
  title,
  content,
  expanded = false,
  onToggle,
  className,
  workspaceId,
  status,
  onApprove,
  onDeny,
}: ChatApprovalCardProps) {
  const isPending = status.status === 'pending_approval'

  // Determine actions based on status
  const actions = isPending ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onApprove?.()
        }}
        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors"
      >
        <Check className="w-4 h-4" />
        批准
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDeny?.()
        }}
        className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
      >
        <X className="w-4 h-4" />
        拒绝
      </button>
    </div>
  ) : undefined

  return (
    <ChatEntryContainer
      variant="plan"
      title={title}
      expanded={expanded}
      onToggle={onToggle}
      className={className}
      status={status}
      actions={actions}
    >
      <ChatMarkdown content={content} workspaceId={workspaceId} />
    </ChatEntryContainer>
  )
}
