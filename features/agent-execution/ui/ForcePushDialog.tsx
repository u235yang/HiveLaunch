// F3: Force Push Dialog
// Force Push 确认对话框

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
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useForcePush } from '../hooks/useForcePush'

interface ForcePushDialogProps {
  isOpen: boolean
  onClose: () => void
  worktreePath: string
  branch: string
  remote?: string
  onSuccess?: () => void
}

export function ForcePushDialog({
  isOpen,
  onClose,
  worktreePath,
  branch,
  remote = 'origin',
  onSuccess,
}: ForcePushDialogProps) {
  const { performForcePush, isLoading, error } = useForcePush({
    onSuccess: () => {
      onSuccess?.()
      onClose()
    },
  })

  const handleForcePush = useCallback(async () => {
    await performForcePush(worktreePath, remote, branch)
  }, [worktreePath, remote, branch, performForcePush])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[400px] max-h-[90dvh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-amber-600 text-base md:text-lg">
            <AlertTriangle className="w-5 h-5" />
            Force Push Required
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 md:py-4 space-y-3 md:space-y-4 overflow-y-auto flex-1">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-medium mb-2">Warning</p>
            <ul className="list-disc list-inside space-y-1 text-amber-700">
              <li>
                Remote branch <code className="bg-amber-100 px-1 rounded">{branch}</code> contains commits that don't exist locally
              </li>
              <li>Force push will overwrite the remote branch</li>
              <li>This action cannot be easily undone</li>
            </ul>
          </div>

          <div className="text-sm text-gray-600">
            <p>
              Push to <code className="bg-gray-100 px-1 rounded">{remote}/{branch}</code>?
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleForcePush}
            disabled={isLoading}
            className="bg-amber-600 hover:bg-amber-700 w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Pushing...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 mr-2" />
                Force Push
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
