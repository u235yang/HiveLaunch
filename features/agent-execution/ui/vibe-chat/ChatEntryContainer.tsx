'use client'

import { ComponentType } from 'react'
import {
  ChevronDown,
  User,
  ListChecks,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolStatus } from './types'

type Variant = 'user' | 'plan' | 'plan_denied' | 'system'

interface VariantConfig {
  icon: ComponentType<{ className?: string }>
  border: string
  headerBg: string
  bg: string
}

const variantConfig: Record<Variant, VariantConfig> = {
  user: {
    icon: User,
    border: 'border-gray-200',
    headerBg: '',
    bg: '',
  },
  plan: {
    icon: ListChecks,
    border: 'border-blue-400',
    headerBg: 'bg-blue-50 dark:bg-blue-950/20',
    bg: 'bg-blue-50/50 dark:bg-blue-950/10',
  },
  plan_denied: {
    icon: ListChecks,
    border: 'border-red-400',
    headerBg: 'bg-red-50 dark:bg-red-950/20',
    bg: 'bg-red-50/50 dark:bg-red-950/10',
  },
  system: {
    icon: Settings,
    border: 'border-gray-200',
    headerBg: 'bg-gray-50 dark:bg-gray-900/30',
    bg: '',
  },
}

interface ChatEntryContainerProps {
  variant: Variant
  title?: React.ReactNode
  headerRight?: React.ReactNode
  expanded?: boolean
  onToggle?: () => void
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  status?: ToolStatus
  isGreyed?: boolean
}

export function ChatEntryContainer({
  variant,
  title,
  headerRight,
  expanded = false,
  onToggle,
  children,
  actions,
  className,
  status,
  isGreyed,
}: ChatEntryContainerProps) {
  // Special case for plan denied
  const config =
    variant === 'plan' && status?.status === 'denied'
      ? variantConfig.plan_denied
      : variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'rounded-lg w-full',
        config.border && 'border',
        config.border,
        config.bg,
        isGreyed && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center px-4 py-2 gap-2 rounded-t-lg overflow-hidden',
          config.headerBg,
          onToggle && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
        onClick={onToggle}
      >
        <Icon className="w-4 h-4 shrink-0 text-gray-500" />
        {title && (
          <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
            {title}
          </span>
        )}
        {headerRight}
        {onToggle && (
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-gray-500 transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Content - shown when expanded */}
      {expanded && children && <div className="p-4">{children}</div>}

      {/* Actions footer - optional */}
      {actions && (
        <div className="bg-blue-50 dark:bg-blue-950/20 backdrop-blur-sm flex items-center gap-2 px-4 py-2 border-t border-gray-200 sticky bottom-0 rounded-b-lg">
          {actions}
        </div>
      )}
    </div>
  )
}
