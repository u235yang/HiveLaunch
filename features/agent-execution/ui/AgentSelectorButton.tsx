'use client'

import { useState, type MouseEvent } from 'react'
import { Bot, ChevronDown, Check, Loader2, RefreshCw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@shared/ui'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'

interface AgentItem {
  id: string
  name: string
  description: string
  is_available?: boolean
}

interface AgentSelectorButtonProps {
  value?: string
  onChange: (agentId: string) => void
  agents?: AgentItem[]
  isLoading?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
  className?: string
  compact?: boolean
}
export function AgentSelectorButton({
  value,
  onChange,
  agents,
  isLoading = false,
  onRefresh,
  isRefreshing = false,
  className,
  compact = false,
}: AgentSelectorButtonProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const [isOpen, setIsOpen] = useState(false)

  const effectiveAgents = agents ?? []

  const selectedAgent = effectiveAgents.find((a) => a.id === value) ?? effectiveAgents[0]
  const displayName = selectedAgent?.name ?? value ?? txt('选择 Agent', 'Select Agent')

  const handleRefresh = (e: MouseEvent<SVGSVGElement>) => {
    e.stopPropagation()
    e.preventDefault()
    onRefresh?.()
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            compact
              ? 'group inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium'
              : 'group inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
            'border-border bg-background text-foreground',
            'hover:bg-muted',
            'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1',
            className
          )}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Bot className="w-3.5 h-3.5 text-amber-500" />
          )}
          {!compact && <span className="hidden text-[11px] text-muted-foreground lg:inline">Agent</span>}
          <span className={cn('truncate', compact ? 'max-w-[84px]' : 'max-w-[96px]')}>{displayName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          {onRefresh && (
            <RefreshCw
              className={cn(
                'w-3.5 h-3.5 cursor-pointer flex-shrink-0 text-muted-foreground hover:text-foreground',
                isRefreshing && 'animate-spin'
              )}
              onClick={handleRefresh}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[90vw] max-w-[320px] p-2 !z-[99999]"
        sideOffset={4}
      >
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {txt('可用 Agent', 'Available Agents')}
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {effectiveAgents.length}
          </span>
        </div>
        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
          {effectiveAgents.length === 0 ? (
            <div className="px-2.5 py-2 text-sm text-muted-foreground">{txt('暂无可用 Agent', 'No available agents')}</div>
          ) : (
            effectiveAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  onChange(agent.id)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                  'border-transparent',
                  agent.id === value
                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
                    : 'text-foreground hover:border-border hover:bg-muted'
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'mt-0.5 h-2 w-2 rounded-full',
                          agent.is_available === false ? 'bg-muted-foreground/40' : 'bg-emerald-500'
                        )}
                      />
                      <span className="truncate font-medium">{agent.name}</span>
                    </div>
                    <div className="mt-1 truncate text-[10px] font-mono text-muted-foreground">
                      {agent.id}
                    </div>
                  </div>
                  {agent.id === value && <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                </div>
                <div className="mt-1.5 line-clamp-2 break-words text-[11px] leading-4 text-muted-foreground">
                  {agent.description.replace(/\s+/g, ' ').trim()}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
