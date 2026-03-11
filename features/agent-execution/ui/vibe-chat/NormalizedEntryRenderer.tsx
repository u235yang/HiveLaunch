'use client'

import type { NormalizedEntry, PatchTypeWithKey, ActionType } from '../../types'
import { ChatUserMessage } from './ChatUserMessage'
import { ChatAssistantMessage } from './ChatAssistantMessage'
import { ChatSystemMessage } from './ChatSystemMessage'
import { ChatErrorMessage } from './ChatErrorMessage'
import { ChatToolSummary } from './ChatToolSummary'
import { ChatThinkingMessage } from './ChatThinkingMessage'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'

interface NormalizedEntryRendererProps {
  entry: PatchTypeWithKey
  className?: string
}

/**
 * Renders a NormalizedEntry (from bee-kanban backend) to the appropriate chat component
 */
export function NormalizedEntryRenderer({ entry, className }: NormalizedEntryRendererProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  // Skip non-normalized entries for now
  if (entry.type !== 'NORMALIZED_ENTRY') {
    // Handle STDOUT/STDERR/DIFF separately if needed
    if (entry.type === 'STDOUT' || entry.type === 'STDERR') {
      return (
        <div className={cn('mb-1 text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 p-2 rounded', className)}>
          <pre className="whitespace-pre-wrap break-all">{entry.content}</pre>
        </div>
      )
    }
    return null
  }

  const normalized = entry.content
  const { entry_type, content } = normalized

  switch (entry_type.type) {
    case 'user_message':
      return (
        <div className={cn('mb-4', className)}>
          <ChatUserMessage content={content} />
        </div>
      )

    case 'assistant_message':
      return (
        <div className={cn('mb-4', className)}>
          <ChatAssistantMessage content={content} />
        </div>
      )

    case 'system_message':
      return (
        <div className={cn('mb-2', className)}>
          <ChatSystemMessage content={content} />
        </div>
      )

    case 'error_message':
      return (
        <div className={cn('mb-2', className)}>
          <ChatErrorMessage content={content} />
        </div>
      )

    case 'thinking':
      return (
        <div className={cn('mb-2', className)}>
          <ChatThinkingMessage content={content} />
        </div>
      )

    case 'tool_use':
      return (
        <div className={cn('mb-2', className)}>
          <ChatToolSummary
            summary={getToolSummary(entry_type.action_type, entry_type.tool_name, txt)}
            status={entry_type.status}
            toolName={entry_type.tool_name}
            actionType={entry_type.action_type.action}
          />
        </div>
      )

    case 'loading':
      return (
        <div className={cn('mb-2 text-sm text-gray-400 italic', className)}>
          {txt('正在处理...', 'Processing...')}
        </div>
      )

    case 'next_action':
      return (
        <div className={cn('mb-2 text-xs text-gray-400', className)}>
          {entry_type.failed ? txt('❌ 执行失败', '❌ Execution failed') : txt('✅ 等待下一步', '✅ Waiting for next step')}
          {entry_type.needs_setup && txt(' - 需要设置', ' - Setup required')}
        </div>
      )

    case 'token_usage_info':
      return (
        <div className={cn('mb-1 text-xs text-gray-400', className)}>
          Token: {entry_type.total_tokens.toLocaleString()} / {entry_type.model_context_window.toLocaleString()}
        </div>
      )

    case 'user_feedback':
      return (
        <div className={cn('mb-2 text-sm text-gray-500', className)}>
          {txt('用户拒绝了', 'User denied')}: {entry_type.denied_tool}
        </div>
      )

    default:
      return null
  }
}

/**
 * Generate a summary string for a tool use entry
 */
function getToolSummary(
  actionType: ActionType,
  toolName: string,
  txt: (zh: string, en: string) => string
): string {
  switch (actionType.action) {
    case 'file_read':
      return txt(`读取文件: ${actionType.path}`, `Read file: ${actionType.path}`)
    case 'file_edit':
      return txt(`编辑文件: ${actionType.path}`, `Edit file: ${actionType.path}`)
    case 'command_run':
      return txt(`执行命令: ${actionType.command}`, `Run command: ${actionType.command}`)
    case 'search':
      return txt(`搜索: ${actionType.query}`, `Search: ${actionType.query}`)
    case 'web_fetch':
      return txt(`获取网页: ${actionType.url}`, `Fetch web page: ${actionType.url}`)
    case 'tool':
      return txt(`工具: ${actionType.tool_name}`, `Tool: ${actionType.tool_name}`)
    case 'task_create':
      return txt(`创建任务: ${actionType.description}`, `Create task: ${actionType.description}`)
    case 'plan_presentation':
      return txt('展示计划', 'Show plan')
    case 'todo_management':
      return txt('更新 TODO 列表', 'Update TODO list')
    case 'other':
      return actionType.description
    default:
      return toolName
  }
}
