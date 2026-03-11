'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import type { CommandRunResult, ToolStatus } from '@/features/agent-execution/types'
import { useUIStore } from '@/features/shared/store'

interface CommandRunToolUIProps {
  command: string
  result?: CommandRunResult
  status: ToolStatus
}

function getStatusConfig(status: ToolStatus, txt: (zh: string, en: string) => string) {
  switch (status.status) {
    case 'success':
      return {
        icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
        text: txt('已完成', 'Completed'),
        color: 'text-emerald-500',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
      }
    case 'failed':
      return {
        icon: <XCircle className="w-4 h-4 text-red-500" />,
        text: txt('失败', 'Failed'),
        color: 'text-red-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
      }
    case 'created':
      return {
        icon: <Clock className="w-4 h-4 text-blue-500" />,
        text: txt('运行中', 'Running'),
        color: 'text-blue-500',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
      }
    case 'pending_approval':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
        text: txt('等待审批', 'Pending approval'),
        color: 'text-amber-500',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
      }
    case 'denied':
    case 'timed_out':
      return {
        icon: <XCircle className="w-4 h-4 text-red-500" />,
        text: status.status === 'denied' ? txt('已拒绝', 'Denied') : txt('超时', 'Timed out'),
        color: 'text-red-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
      }
    default:
      return {
        icon: <Terminal className="w-4 h-4 text-gray-500" />,
        text: '',
        color: 'text-gray-500',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
      }
  }
}

function getExitCodeDisplay(exitStatus?: CommandRunResult['exit_status']): {
  text: string
  color: string
} {
  if (!exitStatus) return { text: '', color: '' }

  if (exitStatus.type === 'exit_code') {
    return {
      text: `Exit: ${exitStatus.code}`,
      color: exitStatus.code === 0 ? 'text-emerald-500' : 'text-red-500',
    }
  }

  return {
    text: exitStatus.success ? 'Success' : 'Failed',
    color: exitStatus.success ? 'text-emerald-500' : 'text-red-500',
  }
}

export function CommandRunToolUI({ command, result, status }: CommandRunToolUIProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [isExpanded, setIsExpanded] = useState(true)
  const config = getStatusConfig(status, txt)
  const exitCode = getExitCodeDisplay(result?.exit_status)

  // 截断显示命令
  const displayCommand = command.length > 60 ? `${command.slice(0, 60)}...` : command

  return (
    <div className="w-full max-w-[90%] my-2">
      <div
        className={`flex items-center justify-between p-3 ${config.bg} border ${config.border} rounded-lg cursor-pointer hover:opacity-80 transition-opacity`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm overflow-hidden">
          {config.icon}
          <span className="font-mono text-gray-700 truncate" title={command}>
            <span className="text-gray-400">$</span> {displayCommand}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {exitCode.text && (
            <span className={`text-xs font-mono ${exitCode.color}`}>
              {exitCode.text}
            </span>
          )}
          <span className={`text-xs ${config.color}`}>{config.text}</span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && result?.output && (
        <div className="mt-2 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
            <span className="text-xs text-gray-400">{txt('输出', 'Output')}</span>
            <button
              className="text-xs text-gray-400 hover:text-gray-200"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(result.output || '')
              }}
            >
              {txt('复制', 'Copy')}
            </button>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <pre className="p-3 text-xs font-mono text-gray-300 whitespace-pre-wrap">
              {result.output}
            </pre>
          </div>
        </div>
      )}

      {status.status === 'denied' && status.reason && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {txt('拒绝原因', 'Reason for denial')}: {status.reason}
        </div>
      )}
    </div>
  )
}
