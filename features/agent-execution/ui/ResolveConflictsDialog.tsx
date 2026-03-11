// F3: Resolve Conflicts Dialog
// 冲突解决对话框

'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@shared/ui'
import { Button } from '@shared/ui'
import { AlertTriangle, GitMerge, Loader2 } from 'lucide-react'
import type { ConflictOp } from '@shared/types'
import { displayConflictOpLabel } from '../lib/conflicts'
import { abortRebase, continueRebase, merge, abortMerge, isMergeInProgress } from '../lib/git-operations'
interface ResolveConflictsDialogProps {
  isOpen: boolean
  onClose: () => void
  worktreePath: string
  conflictOp: ConflictOp
  sourceBranch: string
  targetBranch: string
  conflictedFiles: string[]
  onResolved?: () => void
  onAborted?: () => void
}

export function ResolveConflictsDialog({
  isOpen,
  onClose,
  worktreePath,
  conflictOp,
  sourceBranch,
  targetBranch,
  conflictedFiles,
  onResolved,
  onAborted,
}: ResolveConflictsDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleResolveManually = useCallback(() => {
    // 用户选择手动解决，关闭对话框，让他们自己解决后点击 Continue
    onClose()
  }, [onClose])

  const handleAbort = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (conflictOp === 'rebase') {
        await abortRebase(worktreePath)
      } else if (conflictOp === 'merge') {
        await abortMerge(worktreePath)
      }
      onAborted?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [worktreePath, conflictOp, onAborted, onClose])

  const handleContinue = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (conflictOp === 'rebase') {
        await continueRebase(worktreePath)
      } else if (conflictOp === 'merge') {
        await merge(worktreePath, targetBranch)
      }
      onResolved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [worktreePath, conflictOp, targetBranch, onResolved, onClose])

  const opLabel = displayConflictOpLabel(conflictOp)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-red-600 text-base md:text-lg">
            <AlertTriangle className="w-5 h-5" />
            {opLabel} Conflicts Detected
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {opLabel} encountered conflicts. Please resolve them before continuing.
          </p>
        </DialogHeader>

        <div className="space-y-3 md:space-y-4 overflow-y-auto flex-1">
          {/* Conflict summary */}
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-800">
              {conflictedFiles.length} file(s) with conflicts
            </p>
            {conflictedFiles.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                {conflictedFiles.slice(0, 5).map((file) => (
                  <li key={file} className="truncate font-mono">
                    {file}
                  </li>
                ))}
                {conflictedFiles.length > 5 && (
                  <li className="text-red-600">
                    ...and {conflictedFiles.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Branch info */}
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-mono">{sourceBranch}</span>
              {' → '}
              <span className="font-mono">{targetBranch}</span>
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:!justify-between gap-2 sm:gap-0 shrink-0">
          <Button variant="outline" onClick={handleAbort} disabled={isLoading} className="w-full sm:w-auto order-2 sm:order-1">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Aborting...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 mr-2" />
                Abort {opLabel}
              </>
            )}
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
            <Button variant="outline" onClick={handleResolveManually} disabled={isLoading} className="flex-1 sm:flex-none">
              Resolve Manually
            </Button>
            <Button onClick={handleContinue} disabled={isLoading} className="flex-1 sm:flex-none">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Continuing...
                </>
              ) : (
                <>
                  <GitMerge className="w-4 h-4 mr-2" />
                  Continue {opLabel}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
