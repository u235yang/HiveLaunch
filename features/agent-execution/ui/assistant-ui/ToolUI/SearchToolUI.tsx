'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Search, CheckCircle, XCircle } from 'lucide-react'
import type { ToolStatus } from '@/features/agent-execution/types'
import { useUIStore } from '@/features/shared/store'

interface SearchToolUIProps {
  query: string
  status: ToolStatus
}

export function SearchToolUI({ query, status }: SearchToolUIProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [isExpanded, setIsExpanded] = useState(false)

  const config =
    status.status === 'success'
      ? { icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, text: txt('已完成', 'Completed') }
      : status.status === 'failed'
        ? { icon: <XCircle className="w-4 h-4 text-red-500" />, text: txt('失败', 'Failed') }
        : { icon: <Search className="w-4 h-4 text-blue-500" />, text: txt('搜索中', 'Searching') }

  return (
    <div className="w-full max-w-[90%] my-2">
      <div
        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm overflow-hidden">
          {config.icon}
          <span className="font-mono text-gray-700 truncate">
            🔍 {query}
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
    </div>
  )
}
