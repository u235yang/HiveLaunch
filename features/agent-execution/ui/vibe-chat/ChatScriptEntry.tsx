'use client'

import { Terminal, Wrench, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'
import type { ToolStatus } from './types'
import { ToolStatusDot } from './ToolStatusDot'

interface ChatScriptEntryProps {
  title: string
  processId: string
  exitCode?: number | null
  className?: string
  status: ToolStatus
  onFix?: () => void
  onViewLogs?: () => void
}

export function ChatScriptEntry({
  title,
  processId,
  exitCode,
  className,
  status,
  onFix,
  onViewLogs,
}: ChatScriptEntryProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const isRunning = status.status === 'created'
  const isSuccess = status.status === 'success'
  const isFailed = status.status === 'failed'

  const handleFixClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onFix?.()
  }

  const getSubtitle = () => {
    if (isRunning) return txt('运行中...', 'Running...')
    if (isFailed && exitCode !== null && exitCode !== undefined) {
      return txt(`退出码: ${exitCode}`, `Exit code: ${exitCode}`)
    }
    if (isSuccess) return txt('已完成', 'Completed')
    return txt('点击查看日志', 'Click to view logs')
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 text-sm',
        onViewLogs && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
        className
      )}
      onClick={onViewLogs}
      role={onViewLogs ? 'button' : undefined}
    >
      <span className="relative shrink-0 pt-0.5">
        <Terminal className="w-4 h-4 text-gray-500" />
        <ToolStatusDot
          status={status}
          className="absolute -bottom-0.5 -left-0.5"
        />
      </span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-gray-800 dark:text-gray-200 font-mono truncate">
          {title}
        </span>
        <span className="text-gray-500 text-xs flex items-center gap-1">
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {getSubtitle()}
        </span>
      </div>
      {isFailed && onFix && (
        <button
          type="button"
          onClick={handleFixClick}
          className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded transition-colors"
          title={txt('修复脚本', 'Fix script')}
        >
          <Wrench className="w-3 h-3" />
          <span>{txt('修复', 'Fix')}</span>
        </button>
      )}
    </div>
  )
}
