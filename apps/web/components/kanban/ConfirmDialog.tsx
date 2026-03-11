// F1: ConfirmDialog Component
// 确认对话框 - 用于危险操作的二次确认

'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const resolvedTitle = title ?? (isEn ? 'Confirm Action' : '确认操作')
  const resolvedConfirmText = confirmText ?? (isEn ? 'Confirm' : '确认')
  const resolvedCancelText = cancelText ?? (isEn ? 'Cancel' : '取消')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted || !open) return null

  const variantStyles = {
    danger: {
      icon: 'bg-red-100 text-red-600',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      iconComponent: <AlertTriangle className="w-5 h-5" />,
    },
    warning: {
      icon: 'bg-amber-100 text-amber-600',
      button: 'bg-amber-500 hover:bg-amber-600 text-white',
      iconComponent: <AlertTriangle className="w-5 h-5" />,
    },
    info: {
      icon: 'bg-blue-100 text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      iconComponent: <AlertTriangle className="w-5 h-5" />,
    },
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* Dialog Content */}
      <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl animate-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex justify-center pt-6">
          <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', styles.icon)}>
            {styles.iconComponent}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {resolvedTitle}
          </h3>
          <p className="text-sm text-gray-500">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {resolvedCancelText}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
              styles.button
            )}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
