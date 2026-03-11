'use client'

import type { PatchTypeWithKey } from '../../types'
import { useUIStore } from '@/features/shared/store'
import { VirtualizedChatList } from './VirtualizedChatList'
import { NormalizedEntryRenderer } from './NormalizedEntryRenderer'

interface VibeThreadProps {
  entries: PatchTypeWithKey[]
  isLoading?: boolean
  isRunning?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  className?: string
  emptyMessage?: string
}

export function VibeThread({
  entries,
  isLoading = false,
  isRunning = false,
  hasMore = false,
  onLoadMore,
  className,
  emptyMessage,
}: VibeThreadProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const resolvedEmptyMessage = emptyMessage ?? txt('发送消息开始执行', 'Send a message to start execution')

  return (
    <VirtualizedChatList
      entries={entries}
      isLoading={isLoading}
      isRunning={isRunning}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      renderItem={(entry, _index) => <NormalizedEntryRenderer entry={entry} />}
      className={className}
      emptyMessage={resolvedEmptyMessage}
    />
  )
}
