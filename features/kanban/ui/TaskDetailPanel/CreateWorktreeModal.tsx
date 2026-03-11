'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@shared/ui'
import { Button } from '@shared/ui'
import { GitBranch, ChevronDown, Loader2 } from 'lucide-react'
import { useProjectBranches } from '@/features/agent-execution/hooks/useProjectBranches'

export interface CreateWorktreeTexts {
  createWorktree: string
  selectBaseBranchDescription: string
  baseBranch: string
  loadingBranches: string
  selectBranch: string
  branchNotFound: string
  current: string
  repoPathNotConfigured: string
  cancel: string
}

const defaultTexts: CreateWorktreeTexts = {
  createWorktree: '新建 Worktree',
  selectBaseBranchDescription: '选择基准分支，将从该分支创建新的 Worktree：',
  baseBranch: '基准分支',
  loadingBranches: '加载分支...',
  selectBranch: '选择分支',
  branchNotFound: '未找到分支',
  current: '当前',
  repoPathNotConfigured: '未配置仓库路径',
  cancel: '取消',
}

interface CreateWorktreeModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate?: (baseBranch: string) => void
  repoPath?: string
  disabled?: boolean
  texts?: CreateWorktreeTexts
}

export function CreateWorktreeModal({
  isOpen,
  onClose,
  onCreate,
  repoPath,
  disabled = false,
  texts = defaultTexts,
}: CreateWorktreeModalProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)

  // 获取项目分支列表
  const { branches, isLoading, error: branchError, currentPath } = useProjectBranches({
    repoPath,
  })

  // 过滤出本地分支（不含远程分支）
  const localBranches = branches.filter((b) => !b.is_remote)

  // 当 repoPath 变化时重置选择
  useEffect(() => {
    if (!isOpen) {
      setSelectedBranch('')
      setShowBranchDropdown(false)
    }
  }, [isOpen])

  // 默认选择当前分支
  useEffect(() => {
    if (localBranches.length > 0 && !selectedBranch) {
      const current = localBranches.find((b) => b.is_current)
      if (current) {
        setSelectedBranch(current.name)
      } else if (localBranches[0]) {
        setSelectedBranch(localBranches[0].name)
      }
    }
  }, [localBranches, selectedBranch])

  const handleSubmit = () => {
    if (!selectedBranch) return

    onCreate?.(selectedBranch)
    onClose()
  }

  const isValid = selectedBranch.length > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[400px] p-0 dark:bg-gray-900 dark:border-gray-800">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {texts.createWorktree}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {texts.selectBaseBranchDescription}
          </p>

          {/* 分支选择 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {texts.baseBranch} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => !disabled && setShowBranchDropdown(!showBranchDropdown)}
                disabled={disabled || isLoading || localBranches.length === 0}
                className="flex items-center justify-between w-full h-[46px] rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-offset-gray-900 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
              >
                <div className="flex items-center gap-2">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
                  ) : (
                    <GitBranch className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  )}
                  <span className={selectedBranch ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
                    {isLoading
                      ? texts.loadingBranches
                      : selectedBranch || texts.selectBranch}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform ${
                    showBranchDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* 分支下拉 */}
              {showBranchDropdown && !isLoading && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-[200px] overflow-y-auto dark:border-gray-700 dark:bg-gray-900">
                  {localBranches.length === 0 ? (
                    <div className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                      {texts.branchNotFound}
                    </div>
                  ) : (
                    localBranches.map((branch) => (
                      <button
                        key={branch.name}
                        type="button"
                        onClick={() => {
                          setSelectedBranch(branch.name)
                          setShowBranchDropdown(false)
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          branch.name === selectedBranch
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <GitBranch className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                        <span className="font-mono truncate">{branch.name}</span>
                        {branch.is_current && (
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {texts.current}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {branchError && (
              <p className="text-sm text-red-500">{branchError}</p>
            )}
            {!currentPath && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {texts.repoPathNotConfigured}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800 px-6 py-4">
          <Button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-800"
          >
            {texts.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || disabled}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#F59E0B] hover:bg-[#D97706] rounded-lg shadow-sm shadow-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {texts.createWorktree}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
