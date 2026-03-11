// F3: Commit Dialog
// 提交变更对话框

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@shared/ui'
import { Button } from '@shared/ui'
import { GitCommit, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useCommit } from '../hooks/useCommit'
import { getDiff, FileDiff, FileStatus } from '../lib/git-operations'

interface CommitDialogProps {
  isOpen: boolean
  onClose: () => void
  worktreePath: string
  onSuccess?: () => void
}

export function CommitDialog({
  isOpen,
  onClose,
  worktreePath,
  onSuccess,
}: CommitDialogProps) {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<FileDiff[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)

  const { commitChanges, isLoading, error, result } = useCommit({
    onSuccess: () => {
      onSuccess?.()
      handleClose()
    },
  })

  // 加载变更文件列表
  useEffect(() => {
    if (!isOpen || !worktreePath) {
      setFiles([])
      return
    }

    setIsLoadingFiles(true)
    getDiff(worktreePath)
      .then(setFiles)
      .catch(console.error)
      .finally(() => setIsLoadingFiles(false))
  }, [isOpen, worktreePath])

  // 重置状态
  const handleClose = useCallback(() => {
    setMessage('')
    onClose()
  }, [onClose])

  // 提交
  const handleCommit = useCallback(async () => {
    if (!message.trim() || !worktreePath) return
    await commitChanges(worktreePath, message.trim())
  }, [message, worktreePath, commitChanges])

  // 统计变更
  const stats = {
    added: files.filter(f => f.status === 'added').length,
    modified: files.filter(f => f.status === 'modified').length,
    deleted: files.filter(f => f.status === 'deleted').length,
    untracked: files.filter(f => f.status === 'untracked').length,
  }

  const hasChanges = files.length > 0
  const canCommit = message.trim().length > 0 && hasChanges && !isLoading

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
            <GitCommit className="w-5 h-5" />
            Commit Changes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 md:space-y-4 py-3 md:py-4 overflow-y-auto flex-1">
          {/* 变更统计 */}
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : hasChanges ? (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-4 mb-2">
                <span className="text-green-600">+{stats.added} added</span>
                <span className="text-orange-600">~{stats.modified} modified</span>
                <span className="text-red-600">-{stats.deleted} deleted</span>
                <span className="text-gray-500">?{stats.untracked} untracked</span>
              </div>
              <div className="text-gray-500 text-xs">
                {files.length} file(s) changed
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500 text-sm">
              No changes to commit
            </div>
          )}

          {/* 文件列表 */}
          {hasChanges && (
            <div className="max-h-40 overflow-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-1.5 md:p-2">Status</th>
                    <th className="text-left p-1.5 md:p-2">File</th>
                    <th className="text-right p-1.5 md:p-2 hidden sm:table-cell">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1.5 md:p-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            file.status === 'added'
                              ? 'bg-green-100 text-green-700'
                              : file.status === 'modified'
                              ? 'bg-orange-100 text-orange-700'
                              : file.status === 'deleted'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {file.status}
                        </span>
                      </td>
                      <td className="p-1.5 md:p-2 font-mono text-gray-600 truncate max-w-[150px] sm:max-w-[200px]">
                        {file.path}
                      </td>
                      <td className="p-1.5 md:p-2 text-right text-gray-500 hidden sm:table-cell">
                        +{file.additions} -{file.deletions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Commit message */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Commit message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              className="w-full h-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              disabled={!hasChanges || isLoading}
            />
          </div>

          {/* 错误/成功消息 */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {result && result.success && !error && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              Committed: {result.hash?.slice(0, 7)}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!canCommit}
            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <GitCommit className="w-4 h-4 mr-2" />
                Commit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
