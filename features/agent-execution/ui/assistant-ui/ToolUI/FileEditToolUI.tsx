'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileEdit, CheckCircle, XCircle } from 'lucide-react'
import type { FileChange, ToolStatus } from '@/features/agent-execution/types'
import { useUIStore } from '@/features/shared/store'

interface FileEditToolUIProps {
  path: string
  changes: FileChange[]
  status: ToolStatus
}

function getStatusColor(status: ToolStatus): string {
  switch (status.status) {
    case 'success':
      return 'text-emerald-500'
    case 'failed':
    case 'timed_out':
      return 'text-red-500'
    case 'pending_approval':
      return 'text-amber-500'
    case 'denied':
      return 'text-red-500'
    default:
      return 'text-blue-500'
  }
}

function getStatusIcon(status: ToolStatus) {
  const color = getStatusColor(status)
  switch (status.status) {
    case 'success':
      return <CheckCircle className={`w-4 h-4 ${color}`} />
    case 'failed':
    case 'timed_out':
    case 'denied':
      return <XCircle className={`w-4 h-4 ${color}`} />
    default:
      return <FileEdit className={`w-4 h-4 ${color}`} />
  }
}

function getStatusText(status: ToolStatus, txt: (zh: string, en: string) => string): string {
  switch (status.status) {
    case 'created':
      return txt('准备中', 'Preparing')
    case 'success':
      return txt('已完成', 'Completed')
    case 'failed':
      return txt('失败', 'Failed')
    case 'pending_approval':
      return txt('等待审批', 'Pending approval')
    case 'denied':
      return txt('已拒绝', 'Denied')
    case 'timed_out':
      return txt('超时', 'Timed out')
    default:
      return ''
  }
}

function ChangeItem({
  change,
  index,
  txt,
}: {
  change: FileChange
  index: number
  txt: (zh: string, en: string) => string
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getActionLabel = () => {
    switch (change.action) {
      case 'write':
        return txt('写入', 'Write')
      case 'delete':
        return txt('删除', 'Delete')
      case 'rename':
        return txt('重命名', 'Rename')
      case 'edit':
        return txt('编辑', 'Edit')
      default:
        return txt('未知', 'Unknown')
    }
  }

  const getActionColor = () => {
    switch (change.action) {
      case 'write':
        return 'bg-green-100 text-green-700'
      case 'delete':
        return 'bg-red-100 text-red-700'
      case 'rename':
        return 'bg-blue-100 text-blue-700'
      case 'edit':
        return 'bg-purple-100 text-purple-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${getActionColor()}`}>
            {getActionLabel()}
          </span>
          {change.action === 'rename' && (
            <span className="text-sm text-gray-600">
              → {change.new_path}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">#{index + 1}</span>
      </div>

      {isExpanded && (change.action === 'write' || change.action === 'edit') && (
        <div className="p-3 bg-gray-900">
          {change.action === 'write' && (
            <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto">
              {change.content}
            </pre>
          )}
          {change.action === 'edit' && (
            <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto">
              {change.unified_diff}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function FileEditToolUI({ path, changes, status }: FileEditToolUIProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="w-full max-w-[90%] my-2">
      <div
        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm">
          {getStatusIcon(status)}
          <span className="font-mono text-gray-700 truncate max-w-[300px]" title={path}>
            📄 {path}
          </span>
          <span className={`text-xs ${getStatusColor(status)}`}>
            {getStatusText(status, txt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {changes.length} {txt('个变更', 'changes')}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {changes.map((change, index) => (
            <ChangeItem key={index} change={change} index={index} txt={txt} />
          ))}
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
