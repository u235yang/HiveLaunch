'use client'

import { MessageSquareMore } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatMarkdown } from './ChatMarkdown'

interface ChatThinkingMessageProps {
  content: string
  className?: string
  taskAttemptId?: string
}

export function ChatThinkingMessage({
  content,
  className,
  taskAttemptId,
}: ChatThinkingMessageProps) {
  return (
    <div
      className={cn('flex items-start gap-2 text-sm text-gray-500 opacity-70', className)}
    >
      <MessageSquareMore className="shrink-0 w-4 h-4 pt-0.5" />
      <ChatMarkdown
        content={content}
        workspaceId={taskAttemptId}
        className="text-sm"
      />
    </div>
  )
}
