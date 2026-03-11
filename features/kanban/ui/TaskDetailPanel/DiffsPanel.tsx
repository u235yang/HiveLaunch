// features/kanban/ui/TaskDetailPanel/DiffsPanel.tsx
import React from 'react'
import { CheckCircle, FileCode2, FileText, GitBranch, GitCommit, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'

export interface FileChange {
  id: string
  name: string
  status: 'M' | 'A' | 'D'
  type: 'code' | 'css' | 'doc'
}

interface DiffLine {
  line: string
  type: 'add' | 'remove' | 'context'
}

interface DiffsPanelProps {
  mode: 'executing' | 'reviewing'
  branchName: string
  commitSummary: string
  files: FileChange[]
  diffPreview: DiffLine[]
}

const fileIconMap: Record<FileChange['type'], React.ReactNode> = {
  code: <FileCode2 className="w-4 h-4" />,
  css: <FileText className="w-4 h-4" />,
  doc: <FileText className="w-4 h-4" />,
}

const statusBadgeStyles: Record<FileChange['status'], string> = {
  M: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
  A: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  D: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
}

const DiffsPanel: React.FC<DiffsPanelProps> = ({
  mode,
  branchName,
  commitSummary,
  files,
  diffPreview,
}) => {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Changes</div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{commitSummary}</div>
      </div>
      <div className="p-4 space-y-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400 dark:text-gray-500">{txt('分支', 'Branch')}</span>
          <span className="inline-flex items-center gap-1 font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded dark:text-amber-300 dark:bg-amber-500/20">
            <GitBranch className="w-3 h-3" />
            {branchName}
          </span>
        </div>
        <div
          className={cn(
            'flex items-center gap-2 p-2 rounded-lg border text-[11px] font-medium',
            mode === 'executing'
              ? 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-300'
              : 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300'
          )}
        >
          {mode === 'executing' ? (
            <GitCommit className="w-4 h-4" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {mode === 'executing' ? txt('变更正在生成中', 'Changes are being generated') : txt('变更已完成，等待合并', 'Changes completed, waiting to merge')}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">{txt('修改文件', 'Changed Files')}</div>
          <div className="space-y-1">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2',
                  mode === 'reviewing' && file.type === 'css'
                    ? 'bg-violet-50/60 dark:bg-violet-500/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className={cn('text-gray-400 dark:text-gray-500')}>{fileIconMap[file.type]}</span>
                  <span className="truncate text-xs font-medium">{file.name}</span>
                </div>
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                    statusBadgeStyles[file.status]
                  )}
                >
                  {file.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        {mode === 'reviewing' && (
          <div>
            <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Diff Preview</div>
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-[11px] text-gray-300 border border-gray-800">
              {diffPreview.map((line, index) => (
                <div
                  key={`diff-line-${index}`}
                  className={cn(
                    'whitespace-pre-wrap',
                    line.type === 'add' && 'text-emerald-300',
                    line.type === 'remove' && 'text-rose-300',
                    line.type === 'context' && 'text-gray-400'
                  )}
                >
                  {line.line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
        {mode === 'executing' ? (
          <>
            <button
              className="w-full py-2.5 bg-gray-200 text-gray-400 rounded-lg font-semibold text-sm cursor-not-allowed dark:bg-gray-800 dark:text-gray-500"
              disabled
            >
              {txt('推送更改 (Push)', 'Push Changes')}
            </button>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">{txt('需等待所有测试通过后方可推送', 'Wait for all tests to pass before pushing')}</p>
          </>
        ) : (
          <>
            <button className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 rounded-lg shadow-sm flex items-center justify-center gap-2">
              <UploadCloud className="w-4 h-4" />
              Push
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-1.5 py-2 border border-violet-200 rounded-lg text-xs font-semibold text-violet-700 hover:bg-violet-50">
                Create PR
              </button>
              <button className="flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold">
                Merge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default DiffsPanel
