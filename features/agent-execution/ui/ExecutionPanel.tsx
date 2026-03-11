'use client'

import { ArrowLeft, Bot, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { EntriesProvider } from '@/features/agent-execution/contexts/EntriesContext'
import { ExecutionProcessesProvider } from '@/features/agent-execution/contexts/ExecutionProcessesContext'
import { useUIStore } from '@/features/shared/store'
import { VibeThread, useVibeThread } from './vibe-chat'

interface ExecutionPanelProps {
  sessionId: string
  attemptId?: string
  taskTitle?: string
  agentCli?: string
  onBack?: () => void
}

export function ExecutionPanel({
  sessionId,
  attemptId,
  taskTitle,
  agentCli = 'OPENCODE',
  onBack,
}: ExecutionPanelProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)

  return (
    <EntriesProvider key={sessionId}>
      <ExecutionProcessesProvider key={sessionId} sessionId={sessionId}>
        <ExecutionPanelInner
          sessionId={sessionId}
          attemptId={attemptId}
          taskTitle={taskTitle ?? txt('任务执行中', 'Task Executing')}
          agentCli={agentCli}
          onBack={onBack}
        />
      </ExecutionProcessesProvider>
    </EntriesProvider>
  )
}

function ExecutionPanelInner({
  sessionId,
  taskTitle,
  agentCli,
  onBack,
}: ExecutionPanelProps) {
  const { entries, isLoading, isRunning } = useVibeThread(sessionId)
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors dark:hover:bg-gray-800"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800 truncate max-w-[200px] dark:text-gray-100">
                {taskTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{agentCli}</p>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium dark:bg-blue-500/10 dark:text-blue-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {txt('执行中', 'Running')}
            </div>
          ) : entries.length > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-medium dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle className="w-3.5 h-3.5" />
              {txt('已完成', 'Completed')}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium dark:bg-gray-800 dark:text-gray-300">
              <XCircle className="w-3.5 h-3.5" />
              {txt('等待开始', 'Waiting to start')}
            </div>
          )}
        </div>
      </div>

      {/* Thread / Messages */}
      <div className="flex-1 overflow-hidden">
        <VibeThread
          entries={entries}
          isLoading={isLoading}
          isRunning={isRunning}
          emptyMessage={txt('等待 Agent 开始执行...', 'Waiting for Agent to start...')}
        />
      </div>

      {/* Footer with Follow-up input placeholder */}
      {isRunning && (
        <div className="px-4 py-3 bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{txt('Agent 正在处理，请稍候...', 'Agent is processing, please wait...')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
