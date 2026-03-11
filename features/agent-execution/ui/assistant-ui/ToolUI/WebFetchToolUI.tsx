'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Globe, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { ToolStatus } from '@/features/agent-execution/types'
import { useUIStore } from '@/features/shared/store'

interface WebFetchToolUIProps {
  url: string
  status: ToolStatus
  result?: string
}

export function WebFetchToolUI({ url, status, result }: WebFetchToolUIProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [isExpanded, setIsExpanded] = useState(false)

  const config =
    status.status === 'success'
      ? { icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, text: txt('已完成', 'Completed') }
      : status.status === 'failed'
        ? { icon: <XCircle className="w-4 h-4 text-red-500" />, text: txt('失败', 'Failed') }
        : { icon: <Clock className="w-4 h-4 text-blue-500" />, text: txt('获取中', 'Fetching') }

  // 截断显示 URL
  const displayUrl = url.length > 50 ? `${url.slice(0, 50)}...` : url

  return (
    <div className="w-full max-w-[90%] my-2">
      <div
        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm overflow-hidden">
          {config.icon}
          <span className="font-mono text-blue-600 truncate" title={url}>
            🌐 {displayUrl}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">{config.text}</span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && result && (
        <div className="mt-2 p-3 bg-gray-900 rounded-lg border border-gray-700 overflow-auto max-h-[300px]">
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  )
}
