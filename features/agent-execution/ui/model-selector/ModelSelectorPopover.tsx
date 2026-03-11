'use client'

import { useState } from 'react'
import { ChevronDown, Check, Loader2, RefreshCw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@shared/ui'
import type { ModelSelectorConfig, ModelInfo } from '@shared/types'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/features/shared/store'

interface ModelSelectorPopoverProps {
  config: ModelSelectorConfig
  selectedModelId?: string | null
  onModelSelect: (modelId: string) => void
  isLoading?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
  className?: string
  compact?: boolean
}

/**
 * Simplified Model Selector Popover
 * Displays a list of available models grouped by provider
 */
export function ModelSelectorPopover({
  config,
  selectedModelId,
  onModelSelect,
  isLoading = false,
  onRefresh,
  isRefreshing = false,
  className,
  compact = false,
}: ModelSelectorPopoverProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const [isOpen, setIsOpen] = useState(false)

  const { providers, models } = config

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRefresh?.()
  }

  // Group models by provider
  const modelsByProvider = new Map<string, ModelInfo[]>()
  const ungroupedModels: ModelInfo[] = []

  for (const model of models) {
    if (model.provider_id) {
      const list = modelsByProvider.get(model.provider_id) ?? []
      list.push(model)
      modelsByProvider.set(model.provider_id, list)
    } else {
      ungroupedModels.push(model)
    }
  }

  // Get provider name by id
  const getProviderName = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId)
    return provider?.name ?? providerId
  }

  // Helper function to get the full model ID (provider_id/model_id format)
  const getFullModelId = (model: ModelInfo): string => {
    if (model.provider_id) {
      return `${model.provider_id}/${model.id}`
    }
    return model.id
  }

  // Get selected model display name
  // Note: selectedModelId may be in full format (provider_id/id) or just id
  const selectedModel = models.find((m) => {
    const fullId = getFullModelId(m)
    return fullId === selectedModelId || m.id === selectedModelId
  })
  const displayName = selectedModel?.name ?? selectedModelId ?? txt('选择模型', 'Select model')

  const isDisabled = isLoading

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          className={cn(
            compact
              ? 'inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground'
              : 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground',
            'hover:bg-muted',
            'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : !compact ? (
            <span className="hidden text-[11px] text-muted-foreground lg:inline">{txt('模型', 'Model')}</span>
          ) : null}
          <span className={cn('truncate', compact ? 'max-w-[84px]' : 'max-w-[96px]')}>{displayName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          {onRefresh && (
            <RefreshCw
              className={cn(
                'w-3.5 h-3.5 cursor-pointer flex-shrink-0 text-muted-foreground hover:text-foreground',
                isRefreshing && "animate-spin"
              )}
              onClick={handleRefresh}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[300px] w-[90vw] max-w-[280px] overflow-y-auto p-1.5"
        sideOffset={4}
      >
        {models.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {isLoading ? txt('加载中...', 'Loading...') : txt('暂无可用模型', 'No available models')}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Grouped models by provider */}
            {Array.from(modelsByProvider.entries()).map(([providerId, providerModels]) => (
              <div key={providerId}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {getProviderName(providerId)}
                </div>
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      const fullModelId = model.provider_id ? `${model.provider_id}/${model.id}` : model.id
                      onModelSelect(fullModelId)
                      setIsOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-2 text-sm',
                      'rounded-md transition-colors',
                      model.id === selectedModelId || getFullModelId(model) === selectedModelId
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <span className="truncate">{model.name}</span>
                    {(model.id === selectedModelId || getFullModelId(model) === selectedModelId) && (
                      <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ))}

            {/* Ungrouped models */}
            {ungroupedModels.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {txt('其他', 'Other')}
                </div>
                {ungroupedModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      const fullModelId = model.provider_id ? `${model.provider_id}/${model.id}` : model.id
                      onModelSelect(fullModelId)
                      setIsOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-2 text-sm',
                      'rounded-md transition-colors',
                      model.id === selectedModelId || getFullModelId(model) === selectedModelId
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <span className="truncate">{model.name}</span>
                    {(model.id === selectedModelId || getFullModelId(model) === selectedModelId) && (
                      <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
