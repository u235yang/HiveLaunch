import { cn } from '@/lib/utils'
import type { ToolStatus } from './types'

interface ToolStatusDotProps {
  status: ToolStatus
  className?: string
}

export function ToolStatusDot({ status, className }: ToolStatusDotProps) {
  const statusType = status.status

  // Map status to visual state
  const isSuccess = statusType === 'success'
  const isError =
    statusType === 'failed' ||
    statusType === 'denied' ||
    statusType === 'timed_out'
  const isPending =
    statusType === 'created' || statusType === 'pending_approval'

  return (
    <span className={cn('inline-flex relative', className)}>
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isSuccess && 'bg-emerald-500',
          isError && 'bg-red-500',
          isPending && 'bg-gray-400'
        )}
      />
      {isPending && (
        <span className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-gray-400 animate-ping" />
      )}
    </span>
  )
}
