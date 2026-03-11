// features/kanban/ui/TaskDetailPanel/AttemptPanel.tsx
import React from 'react'
import { Paperclip, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  author: string
  time: string
  content: string
  codeSnippet?: {
    title: string
    lines: { type: 'remove' | 'add' | 'context'; text: string }[]
  }
  toolCall?: {
    name: string
    detail: string
  }
}

interface AttemptPanelProps {
  mode: 'executing' | 'reviewing'
  sessionId: string
  messages: ChatMessage[]
}

const AttemptPanel: React.FC<AttemptPanelProps> = ({ mode, sessionId, messages }) => {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="text-sm font-semibold text-gray-900">{txt('执行日志', 'Execution Log')}</div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-2 w-2 rounded-full',
              mode === 'executing' ? 'bg-amber-500' : 'bg-emerald-500'
            )}
          />
          <span className="text-[11px] text-gray-400 font-mono">SESSION ID: {sessionId}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-4', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {message.role === 'agent' && (
              <div className="w-8 h-8 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                <span className="text-xs font-semibold">🤖</span>
              </div>
            )}
            <div
              className={cn(
                'flex flex-col gap-1.5 max-w-[80%]',
                message.role === 'user' && 'items-end'
              )}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    message.role === 'user' ? 'text-gray-800' : 'text-violet-600'
                  )}
                >
                  {message.author}
                </span>
                <span className="text-[10px] text-gray-400 uppercase">{message.time}</span>
              </div>
              <div
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed border',
                  message.role === 'user'
                    ? 'bg-amber-50 border-amber-100 text-gray-700 rounded-br-none'
                    : 'bg-white border-gray-200 text-gray-700 rounded-bl-none shadow-sm'
                )}
              >
                <p>{message.content}</p>
                {message.codeSnippet && (
                  <div className="mt-3 rounded-lg bg-gray-900 text-gray-300 p-3 font-mono text-[11px] border border-gray-800">
                    <div className="flex items-center gap-2 mb-2 text-gray-400">
                      <span className="text-xs">{message.codeSnippet.title}</span>
                    </div>
                    <div className="space-y-1">
                      {message.codeSnippet.lines.map((line, index) => (
                        <div
                          key={`${message.id}-line-${index}`}
                          className={cn(
                            'whitespace-pre-wrap',
                            line.type === 'add' && 'text-emerald-300',
                            line.type === 'remove' && 'text-rose-300',
                            line.type === 'context' && 'text-gray-400'
                          )}
                        >
                          {line.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {message.toolCall && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-600">Tool Use: {message.toolCall.name}</span>
                    <span className="text-gray-400">{txt('展开', 'Expand')}</span>
                  </div>
                  <div className="mt-2 text-gray-500">{message.toolCall.detail}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {mode === 'executing' && (
          <div className="flex items-center gap-2 text-gray-400 bg-gray-50 px-3 py-2 rounded-full border border-gray-200 w-fit">
            <span className="text-xs">🤖</span>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            </div>
          </div>
        )}
      </div>
      {mode === 'executing' && (
        <div className="p-4 border-t border-gray-200 bg-white/80 backdrop-blur-md">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 gap-2">
            <input
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-700 placeholder-gray-400"
              placeholder={txt('回复 Agent 或下达指令...', 'Reply to agent or enter commands...')}
              type="text"
            />
            <button className="p-2 text-gray-400 hover:text-gray-600">
              <Paperclip className="w-4 h-4" />
            </button>
            <button className="w-9 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center justify-center shadow-sm">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AttemptPanel
