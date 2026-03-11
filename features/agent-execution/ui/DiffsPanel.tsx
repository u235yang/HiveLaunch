'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, RefreshCw } from 'lucide-react'
import { useGitDiffs } from '../hooks'

interface DiffsPanelProps {
  worktreePath: string
  onRefresh?: () => void
}

export function DiffsPanel({ worktreePath, onRefresh }: DiffsPanelProps) {
  const { data: diffs = [], isLoading, error, refetch } = useGitDiffs(worktreePath)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleRefresh = () => {
    refetch()
    onRefresh?.()
  }

  const statusColors: Record<string, string> = {
    added: 'text-green-600 bg-green-50 dark:text-green-300 dark:bg-green-500/20',
    modified: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/20',
    deleted: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/20',
    renamed: 'text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-500/20',
    untracked: 'text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-700/40',
  }

  const statusLabels: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
  }

  const totalAdditions = diffs.reduce((sum, d) => sum + d.additions, 0)
  const totalDeletions = diffs.reduce((sum, d) => sum + d.deletions, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-lg dark:text-red-300 dark:bg-red-500/10">
        <p>Error loading diffs: {error.message}</p>
        <button
          onClick={handleRefresh}
          className="mt-2 text-sm text-red-700 underline dark:text-red-300"
        >
          Try again
        </button>
      </div>
    )
  }

  if (diffs.length === 0) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400 text-center">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No changes detected</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
          <span className="font-medium">{diffs.length} files changed</span>
          <span className="text-green-600">+{totalAdditions}</span>
          <span className="text-red-600">-{totalDeletions}</span>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {diffs.map((diff) => (
          <div key={diff.path} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
            {/* File header */}
            <button
              onClick={() => toggleFile(diff.path)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 text-left"
            >
              {expandedFiles.has(diff.path) ? (
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              )}
              <span
                className={`px-1.5 py-0.5 text-xs font-mono rounded ${statusColors[diff.status]}`}
              >
                {statusLabels[diff.status]}
              </span>
              <span className="flex-1 truncate text-sm font-mono text-gray-800 dark:text-gray-200">
                {diff.path}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                <span className="text-green-600">+{diff.additions}</span>
                {' / '}
                <span className="text-red-600">-{diff.deletions}</span>
              </span>
            </button>

            {/* Diff content */}
            {expandedFiles.has(diff.path) && (
              <div className="bg-gray-900 text-gray-100 text-xs font-mono overflow-x-auto">
                {diff.diff ? (
                  <pre className="p-2 leading-relaxed">
                    {diff.diff.split('\n').map((line, i) => {
                      let lineClass = 'text-gray-300'
                      if (line.startsWith('+')) lineClass = 'text-green-400'
                      else if (line.startsWith('-')) lineClass = 'text-red-400'
                      else if (line.startsWith('@@')) lineClass = 'text-blue-400'

                      return (
                        <div key={i} className={`${lineClass} whitespace-pre`}>
                          {line}
                        </div>
                      )
                    })}
                  </pre>
                ) : (
                  <div className="px-3 py-2 text-gray-400">No diff content available</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
