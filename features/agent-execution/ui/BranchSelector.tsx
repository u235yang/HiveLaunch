// F3: Branch Selector
// 分支选择下拉框

'use client'

import { useState, useEffect, useRef } from 'react'
import { GitBranch, ChevronDown, Check, Loader2, RefreshCw } from 'lucide-react'
import { useBranches } from '../hooks/useBranches'

interface BranchSelectorProps {
  worktreePath: string | null
  currentBranch?: string
  onChange?: (branch: string) => void
  className?: string
  texts?: BranchSelectorTexts
}

interface BranchSelectorTexts {
  noWorkspace: string
  loadFailed: string
  localBranches: string
  remoteBranches: string
  refreshBranches: string
  unknown: string
}

const defaultTexts: BranchSelectorTexts = {
  noWorkspace: 'No workspace',
  loadFailed: 'Failed to load branches',
  localBranches: 'Local Branches',
  remoteBranches: 'Remote Branches',
  refreshBranches: 'Refresh branches',
  unknown: 'unknown',
}

export function BranchSelector({
  worktreePath,
  currentBranch,
  onChange,
  className = '',
  texts = defaultTexts,
}: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    localBranches,
    remoteBranches,
    currentBranch: fetchedBranch,
    isLoading,
    error,
    refetch,
  } = useBranches(worktreePath)

  const displayBranch = currentBranch || fetchedBranch || texts.unknown

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!worktreePath) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-500 ${className}`}
      >
        <GitBranch className="w-4 h-4" />
        {texts.noWorkspace}
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg text-sm text-red-600 ${className}`}
      >
        <GitBranch className="w-4 h-4" />
        {texts.loadFailed}
        <button
          onClick={refetch}
          className="ml-auto hover:text-red-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 ${
          isOpen ? 'border-amber-500 ring-1 ring-amber-500' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <GitBranch className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-mono text-gray-700 dark:text-gray-200 truncate">
            {displayBranch}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
          {/* 本地分支 */}
          {localBranches.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">
                {texts.localBranches}
              </div>
              {localBranches.map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  onClick={() => {
                    onChange?.(branch.name)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                    branch.name === displayBranch
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-gray-700'
                  }`}
                >
                  {branch.name === displayBranch && (
                    <Check className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span className="font-mono truncate">{branch.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 远程分支 */}
          {remoteBranches.length > 0 && (
            <div className="py-1 border-t">
              <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">
                {texts.remoteBranches}
              </div>
              {remoteBranches.slice(0, 20).map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  onClick={() => {
                    onChange?.(branch.name)
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-500 hover:bg-gray-50"
                >
                  <span className="font-mono truncate">{branch.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 刷新按钮 */}
          <div className="py-1 border-t">
            <button
              type="button"
              onClick={() => refetch()}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {texts.refreshBranches}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
