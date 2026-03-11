'use client'

import { cn } from '@/lib/utils'
import { MarkdownText } from '../assistant-ui/MarkdownText'

interface ChatMarkdownProps {
  content: string
  maxWidth?: string
  className?: string
  workspaceId?: string // for future extension
}

export function ChatMarkdown({
  content,
  maxWidth = '800px',
  className,
}: ChatMarkdownProps) {
  return (
    <div className="text-sm" style={{ maxWidth }}>
      <div className={cn('whitespace-pre-wrap break-words', className)}>
        <MarkdownText text={content} />
      </div>
    </div>
  )
}
