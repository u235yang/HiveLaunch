'use client'

import { useEffect, useRef } from 'react'
import { Bot, User, AlertCircle, Info, Loader2 } from 'lucide-react'
import type { AssistantMessage, ContentPart } from '@/features/agent-execution/runtime/BeeKanbanRuntime'
import { useUIStore } from '@/features/shared/store'
import {
  FileEditToolUI,
  CommandRunToolUI,
  TodoToolUI,
  SearchToolUI,
  WebFetchToolUI,
} from './ToolUI'
import type { FileChange, CommandRunResult, ToolStatus } from '@/features/agent-execution/types'

interface ThreadProps {
  messages: AssistantMessage[]
  isLoading?: boolean
  isRunning?: boolean
}

interface MessageItem {
  key: string
  message: AssistantMessage
}

function useLocaleText() {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  return (zh: string, en: string) => (isEn ? en : zh)
}

function UserMessage({ message }: { message: AssistantMessage }) {
  const content = typeof message.content === 'string' ? message.content : ''
  const txt = useLocaleText()

  return (
    <div className="flex flex-col items-end gap-1 px-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{txt('你', 'You')}</span>
        <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white">
          <User className="w-4 h-4" />
        </div>
      </div>
      <div className="max-w-[80%] bg-blue-50 text-gray-800 p-3.5 rounded-2xl rounded-tr-none shadow-sm dark:bg-blue-950/40 dark:text-gray-100">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  )
}

function ToolCallPart({
  part,
}: {
  part: { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown>; result?: unknown }
}) {
  const { toolName, args, result } = part

  // 根据工具名称和参数渲染对应的 ToolUI
  switch (toolName) {
    case 'file_read':
    case 'file_edit':
      return (
        <FileEditToolUI
          path={(args.path as string) || ''}
          changes={(args.changes as FileChange[]) || []}
          status={(result as ToolStatus) || { status: 'created' }}
        />
      )

    case 'command_run':
      return (
        <CommandRunToolUI
          command={(args.command as string) || ''}
          result={result as CommandRunResult | undefined}
          status={(result as ToolStatus) || { status: 'created' }}
        />
      )

    case 'todo_management':
      return (
        <TodoToolUI
          todos={(args.todos as { content: string; status: string; priority?: string }[]) || []}
          operation={(args.operation as string) || 'update'}
          status={(result as ToolStatus) || { status: 'created' }}
        />
      )

    case 'search':
      return (
        <SearchToolUI
          query={(args.query as string) || ''}
          status={(result as ToolStatus) || { status: 'created' }}
        />
      )

    case 'web_fetch':
      return (
        <WebFetchToolUI
          url={(args.url as string) || ''}
          status={(result as ToolStatus) || { status: 'created' }}
          result={typeof result === 'string' ? result : undefined}
        />
      )

    default:
      // 通用工具渲染
      return (
        <div className="w-full max-w-[90%] my-2 p-3 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-mono text-gray-600 dark:text-gray-300">
            🔧 {toolName}
          </div>
          {Object.keys(args).length > 0 && (
            <pre className="mt-2 text-xs text-gray-500 overflow-auto dark:text-gray-400">
              {JSON.stringify(args, null, 2)}
            </pre>
          )}
        </div>
      )
  }
}

function TextPart({ text }: { text: string }) {
  // 检测特殊前缀
  if (text.startsWith('💭 ')) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 italic dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
        {text}
      </div>
    )
  }

  if (text.startsWith('ℹ️ ')) {
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{text.slice(2)}</span>
      </div>
    )
  }

  if (text.startsWith('❌ ')) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{text.slice(2)}</span>
      </div>
    )
  }

  if (text.startsWith('⏳')) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{text}</span>
      </div>
    )
  }

  // 普通文本
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
}

function AssistantMessage({ message }: { message: AssistantMessage }) {
  const content = message.content

  if (typeof content === 'string') {
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white">
            <Bot className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Agent</span>
        </div>
        <div className="max-w-[90%] bg-white text-gray-800 p-4 rounded-2xl rounded-tl-none shadow-md border border-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">
          <TextPart text={content} />
        </div>
      </div>
    )
  }

  // ContentPart[]
  const parts = content as ContentPart[]

  return (
    <div className="flex flex-col items-start gap-2 px-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white">
          <Bot className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Agent</span>
      </div>
      <div className="max-w-[90%] space-y-2">
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return (
              <div
                key={index}
                className="bg-white text-gray-800 p-4 rounded-2xl rounded-tl-none shadow-md border border-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
              >
                <TextPart text={part.text} />
              </div>
            )
          }

          if (part.type === 'tool-call') {
            return <ToolCallPart key={part.toolCallId} part={part} />
          }

          return null
        })}
      </div>
    </div>
  )
}

function LoadingIndicator() {
  const txt = useLocaleText()

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white">
        <Bot className="w-4 h-4" />
      </div>
      <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-300" />
        <span className="text-sm text-gray-500 dark:text-gray-300">{txt('正在处理...', 'Processing...')}</span>
      </div>
    </div>
  )
}

// 消息渲染组件（用于虚拟列表）
function MessageRenderer({ message }: { message: AssistantMessage }) {
  return message.role === 'user' ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage message={message} />
  )
}

export function Thread({ messages, isLoading, isRunning }: ThreadProps) {
  const txt = useLocaleText()
  const containerRef = useRef<HTMLDivElement>(null)

  // 准备虚拟列表数据
  const items: MessageItem[] = messages.map((msg) => ({
    key: msg.id,
    message: msg,
  }))

  // 自动滚动到底部
  useEffect(() => {
    if (isRunning && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages.length, isRunning])

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto h-full">
      {messages.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <Bot className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm">{txt('等待消息...', 'Waiting for messages...')}</p>
        </div>
      ) : (
        <>
          {/* 使用简单渲染（对于消息数量较少的情况） */}
          {items.length < 100 ? (
            <div className="py-2">
              {items.map((item) => (
                <MessageRenderer key={item.key} message={item.message} />
              ))}
            </div>
          ) : (
            // 对于大量消息，使用简单分批渲染
            <div className="py-2">
              {items.map((item) => (
                <MessageRenderer key={item.key} message={item.message} />
              ))}
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && <LoadingIndicator />}
        </>
      )}
    </div>
  )
}
