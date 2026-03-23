'use client'

import { useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { VirtuosoHandle } from 'react-virtuoso'
import { Loader2 } from 'lucide-react'
import { useUIStore } from '@/features/shared/store'

interface VirtualizedChatListProps<T> {
  entries: T[]
  isLoading?: boolean
  isRunning?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  scrollResetKey?: string
  renderItem: (entry: T, index: number) => React.ReactNode
  className?: string
  emptyMessage?: string
}

export function VirtualizedChatList<T>({
  entries,
  isLoading = false,
  isRunning = false,
  hasMore = false,
  onLoadMore,
  scrollResetKey,
  renderItem,
  className,
  emptyMessage,
}: VirtualizedChatListProps<T>) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const resolvedEmptyMessage = emptyMessage ?? txt('发送消息开始执行', 'Send a message to start execution')
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const didInitialScrollRef = useRef(false)
  const followEnabledRef = useRef(true)

  useEffect(() => {
    didInitialScrollRef.current = false
    followEnabledRef.current = true
  }, [scrollResetKey])

  useEffect(() => {
    if (entries.length === 0) {
      didInitialScrollRef.current = false
      followEnabledRef.current = true
      return
    }

    if (didInitialScrollRef.current) return

    let rafId = 0
    let rafId2 = 0
    const scrollToLatest = () => {
      virtuosoRef.current?.scrollToIndex({
        index: entries.length - 1,
        align: 'end',
        behavior: 'auto',
      })
    }
    didInitialScrollRef.current = true
    rafId = requestAnimationFrame(() => {
      scrollToLatest()
      rafId2 = requestAnimationFrame(scrollToLatest)
    })
    return () => {
      cancelAnimationFrame(rafId)
      cancelAnimationFrame(rafId2)
    }
  }, [entries.length, scrollResetKey])

  // Empty state
  if (entries.length === 0 && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-sm">{resolvedEmptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex-1 h-full ${className || ''}`}>
      <Virtuoso
        ref={virtuosoRef}
        data={entries}
        followOutput={() => {
          if (!didInitialScrollRef.current) return false
          if (!followEnabledRef.current) return false
          return isRunning ? 'smooth' : true
        }}
        atBottomStateChange={(atBottom) => {
          if (!didInitialScrollRef.current) return
          followEnabledRef.current = atBottom
        }}
        startReached={hasMore ? onLoadMore : undefined}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        overscan={5}
        defaultItemHeight={100}
        itemContent={(index, entry) => (
          <div className="py-2 px-4">
            {renderItem(entry, index)}
          </div>
        )}
        components={{
          Header: () =>
            hasMore && !isLoading ? (
              <div className="p-4 text-center">
                <button
                  onClick={onLoadMore}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {txt('加载更多历史记录...', 'Load more history...')}
                </button>
              </div>
            ) : null,
          Footer: () =>
            isLoading ? (
              <div className="p-4 text-center text-gray-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{txt('加载中...', 'Loading...')}</span>
              </div>
            ) : isRunning ? (
              <div className="p-4 text-center text-gray-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{txt('Agent 正在处理...', 'Agent is processing...')}</span>
              </div>
            ) : null,
        }}
      />
    </div>
  )
}
