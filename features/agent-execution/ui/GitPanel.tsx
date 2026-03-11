'use client'

import { useEffect, useState } from 'react'
import { GitBranchStatusPanel } from './GitBranchStatusPanel'
import { GitActionsPanel } from './GitActionsPanel'
import { DiffsPanel } from './DiffsPanel'
import { WorktreeFilesPanel } from './WorktreeFilesPanel'
import { useUIStore } from '@/features/shared/store'

export type GitPanelTab = 'changes' | 'actions' | 'files'

interface GitPanelProps {
  worktreePath: string
  targetBranch: string
  branchName: string
  onDirectPushSuccess?: () => void
  onPRCreated?: (url: string) => void
  onOpenFilePreview?: (path: string) => void
}

export function GitPanel({
  worktreePath,
  targetBranch,
  branchName,
  onDirectPushSuccess,
  onPRCreated,
  onOpenFilePreview,
}: GitPanelProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [activeTab, setActiveTab] = useState<GitPanelTab>('changes')
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<string | null>(null)

  useEffect(() => {
    setSelectedPreviewFile(null)
  }, [worktreePath])

  if (!worktreePath) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-900">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Git</h3>
          <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{txt('暂无工作区', 'No workspace available')}</p>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm dark:text-gray-500">
          {txt('启动执行后可查看变更', 'Start execution to see changes')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* 分支状态头部 - 始终显示 */}
      <GitBranchStatusPanel 
        worktreePath={worktreePath} 
        targetBranch={targetBranch}
        branchName={branchName}
      />

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setActiveTab('changes')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'changes'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {txt('变更', 'Changes')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'files'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {txt('文件', 'Files')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('actions')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'actions'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {txt('操作', 'Actions')}
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        <div className={activeTab === 'files' ? 'h-full' : 'hidden h-full'}>
          <WorktreeFilesPanel
            worktreePath={worktreePath}
            selectedFile={selectedPreviewFile}
            onSelectedFileChange={setSelectedPreviewFile}
            onOpenFile={onOpenFilePreview}
            mode="navigation"
          />
        </div>
        {activeTab === 'changes' ? (
          <DiffsPanel worktreePath={worktreePath} />
        ) : activeTab === 'actions' ? (
          <GitActionsPanel
            worktreePath={worktreePath}
            targetBranch={targetBranch}
            branchName={branchName}
            onDirectPushSuccess={onDirectPushSuccess}
            onPRCreated={onPRCreated}
          />
        ) : null}
      </div>
    </div>
  )
}
