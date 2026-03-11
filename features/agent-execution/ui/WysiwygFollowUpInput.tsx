'use client'

import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react'
import { Send, Square, ImagePlus, Camera, X, Loader2, Cpu } from 'lucide-react'
import { WysiwygEditor } from './wysiwyg'
import { ModelSelectorPopover } from './model-selector'
import { AgentSelectorButton } from './AgentSelectorButton'
import { useExecutorDiscovery } from '../hooks/useExecutorDiscovery'
import { resolveHttpUrl, getTransportSnapshot } from '@/features/agent-execution/lib/api-config'
import { useMobile } from '@/hooks/use-mobile'
import { useUIStore } from '@/features/shared/store'
import type { BaseCodingAgent, SendMessageShortcut } from '@shared/types'

interface WysiwygFollowUpInputProps {
  isExecuting: boolean
  isConnected: boolean
  agent: string | null  // 🔹 修改：支持任意字符串类型
  workspaceId?: string
  selectedModelId?: string | null
  value?: string
  onValueChange?: (value: string) => void
  onSend: (message: string, imageIds?: string[]) => Promise<void>
  onStop: () => Promise<void>
  onSave?: (message: string) => Promise<void> | void
  onAgentChange?: (agentId: string) => void  // 🔹 修改：支持任意字符串类型
  onModelChange?: (modelId: string) => void
  sendShortcut?: SendMessageShortcut
  toolbarExtras?: ReactNode
  statusBarVisible?: boolean
  stopButtonVisible?: boolean
}

interface UploadedImage {
  id: string
  originalName: string
  sizeBytes: number
}

const EXECUTOR_VALUES: BaseCodingAgent[] = [
  'OPENCODE',
  'CLAUDE_CODE',
  'CURSOR',
  'QWEN',
  'COPILOT',
  'DROID',
  'AMP',
  'GEMINI',
]

const normalizeExecutor = (value: string | null | undefined): BaseCodingAgent => {
  if (!value) return 'OPENCODE'
  const normalized = value.toUpperCase().replace(/-/g, '_')
  if (normalized === 'CLAUDE') return 'CLAUDE_CODE'
  if (EXECUTOR_VALUES.includes(normalized as BaseCodingAgent)) {
    return normalized as BaseCodingAgent
  }
  return 'OPENCODE'
}

export function WysiwygFollowUpInput({
  isExecuting,
  isConnected,
  agent,
  workspaceId,
  selectedModelId,
  value,
  onValueChange,
  onSend,
  onStop,
  onSave,
  onAgentChange,
  onModelChange,
  sendShortcut = 'ModifierEnter',
  toolbarExtras,
  statusBarVisible = true,
  stopButtonVisible = true,
}: WysiwygFollowUpInputProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const imageUploadFailedText = txt('图片上传失败', 'Image upload failed')
  const [internalMessage, setInternalMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useMobile()
  const executor = useMemo(() => normalizeExecutor(agent), [agent])
  
  // 本地状态：用户当前选择的模型（用于立即更新 UI）
  const [localSelectedModelId, setLocalSelectedModelId] = useState<string | null>(null)

  // Get executor discovery data for model selector
  // 🔹 修复：useExecutorDiscovery 需要 BaseCodingAgent 类型
  const discovery = useExecutorDiscovery(executor, { workspaceId })
  
  // 实际使用的 modelId：优先使用本地状态，否则使用 props 或默认值
  const effectiveModelId = localSelectedModelId ?? selectedModelId ?? discovery.defaultModel
  const selectedAgentId = useMemo(() => {
    const next = agent?.trim()
    if (!next) return discovery.agents[0]?.id
    const matched = discovery.agents.find((item) => item.id.toLowerCase() === next.toLowerCase())
    if (matched) return matched.id
    return EXECUTOR_VALUES.includes(next.toUpperCase().replace(/-/g, '_') as BaseCodingAgent)
      ? discovery.agents[0]?.id
      : next
  }, [agent, discovery.agents])

  useEffect(() => {
    if (!isMobile) return
    const snapshot = getTransportSnapshot()
    console.info('[mobile-model] followup-input state', {
      workspaceId,
      agent,
      selectedModelIdFromTask: selectedModelId,
      localSelectedModelId,
      defaultModel: discovery.defaultModel,
      effectiveModelId,
      modelsCount: discovery.models.length,
      loadingModels: discovery.loadingModels,
      isRefreshing: discovery.isRefreshing,
      discoveryError: discovery.error,
      transportMode: snapshot.mode,
      transportConnected: snapshot.connected,
      transportBackend: snapshot.backendInstanceId,
      transportSession: snapshot.sessionScope,
    })
  }, [
    isMobile,
    workspaceId,
    agent,
    selectedModelId,
    localSelectedModelId,
    discovery.defaultModel,
    discovery.models.length,
    discovery.loadingModels,
    discovery.isRefreshing,
    discovery.error,
    effectiveModelId,
  ])

  const isControlled = typeof value === 'string'
  const message = isControlled ? value : internalMessage
  const setMessage = useCallback((nextValue: string) => {
    if (!isControlled) {
      setInternalMessage(nextValue)
    }
    onValueChange?.(nextValue)
  }, [isControlled, onValueChange])

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        const base64 = result.includes(',') ? result.split(',')[1] : result
        resolve(base64)
      }
      reader.onerror = () => reject(new Error('Failed to read image file'))
      reader.readAsDataURL(file)
    })

  const uploadSelectedImages = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    setIsUploadingImages(true)
    setImageUploadError(null)
    try {
      const uploaded: UploadedImage[] = []
      for (const file of Array.from(files)) {
        const base64 = await readFileAsBase64(file)
        const response = await fetch(resolveHttpUrl('/api/images'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            dataBase64: base64,
          }),
        })
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || imageUploadFailedText)
        }
        const image = await response.json()
        uploaded.push({
          id: image.id,
          originalName: image.originalName,
          sizeBytes: image.sizeBytes,
        })
      }
      setUploadedImages((prev) => {
        const existing = new Set(prev.map((img) => img.id))
        const merged = [...prev]
        for (const item of uploaded) {
          if (!existing.has(item.id)) {
            merged.push(item)
          }
        }
        return merged
      })
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : imageUploadFailedText)
    } finally {
      setIsUploadingImages(false)
      event.target.value = ''
    }
  }, [imageUploadFailedText])

  const handleSend = useCallback(async () => {
    if ((!message.trim() && uploadedImages.length === 0) || isExecuting) return

    const messageToSend = message.trim()
    setIsSending(true)

    try {
      await onSend(messageToSend, uploadedImages.map((img) => img.id))
      setMessage('')
      setUploadedImages([])
      setImageUploadError(null)
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }, [message, isExecuting, onSend, uploadedImages])

  const handleStop = useCallback(async () => {
    try {
      await onStop()
    } catch (error) {
      console.error('Failed to stop execution:', error)
    }
  }, [onStop])

  const handleSave = useCallback(async () => {
    if (!onSave || !message.trim()) return
    setIsSaving(true)
    try {
      await onSave(message.trim())
    } finally {
      setIsSaving(false)
    }
  }, [onSave, message])

  // Determine if sending is allowed
  const canSend = !isExecuting && !isSending && isConnected
  const canSave = !isSaving && !!onSave && !!message.trim()

  return (
    <div className="border-t border-border bg-card px-3 py-1.5 text-card-foreground md:px-4 md:py-2">
      {/* Agent/Model Selector Bar */}
      <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Media Actions - Left Side */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isExecuting || isSending || isUploadingImages || !isConnected}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={txt('选图', 'Gallery')}
          >
            <ImagePlus className="w-3.5 h-3.5" />
          </button>
          {isMobile && (
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isExecuting || isSending || isUploadingImages || !isConnected}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={txt('拍照', 'Camera')}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="mx-1 h-4 w-px bg-border shrink-0" />

        {/* Core Config - Right Side */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled
            className="inline-flex h-7 cursor-default items-center gap-1 rounded-md border border-border bg-muted/40 pl-1.5 pr-2 text-[11px] font-medium text-foreground"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-amber-500/15 text-amber-500">
              <Cpu className="w-2.5 h-2.5" />
            </span>
            <span className="text-muted-foreground">Exec</span>
            <span className="max-w-[72px] truncate">{executor}</span>
          </button>

          <AgentSelectorButton
            value={selectedAgentId}
            onChange={(agentId) => {
              onAgentChange?.(agentId)
            }}
            agents={discovery.agents.map((item) => ({
              id: item.id,
              name: item.label,
              description: item.description || '',
              is_available: true,
            }))}
            isLoading={discovery.loadingAgents}
            onRefresh={discovery.refreshModels}
            isRefreshing={discovery.isRefreshing}
            compact
            className="h-7 shrink-0 rounded-md bg-background/80"
          />

          <ModelSelectorPopover
            config={discovery.modelSelector}
            selectedModelId={effectiveModelId}
            onModelSelect={(modelId) => {
              if (isMobile) {
                const snapshot = getTransportSnapshot()
                console.info('[mobile-model] user select model', {
                  workspaceId,
                  agent,
                  previousEffectiveModelId: effectiveModelId,
                  nextModelId: modelId,
                  selectedModelIdFromTask: selectedModelId,
                  localSelectedModelId,
                  transportMode: snapshot.mode,
                  transportConnected: snapshot.connected,
                  transportBackend: snapshot.backendInstanceId,
                  transportSession: snapshot.sessionScope,
                })
              }
              setLocalSelectedModelId(modelId)
              onModelChange?.(modelId)
            }}
            isLoading={discovery.loadingModels}
            onRefresh={discovery.refreshModels}
            isRefreshing={discovery.isRefreshing}
            compact
            className="h-7 shrink-0 rounded-md bg-background/80"
          />

          {toolbarExtras}
        </div>
        <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={uploadSelectedImages}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={uploadSelectedImages}
            className="hidden"
          />
        </div>

      {(isUploadingImages || imageUploadError || uploadedImages.length > 0) && (
        <div className="mb-2 rounded-lg border border-border bg-muted px-3 py-2">
          {isUploadingImages && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{txt('正在上传图片...', 'Uploading images...')}</span>
            </div>
          )}
          {imageUploadError && (
            <p className="text-xs text-red-500">{imageUploadError}</p>
          )}
          {uploadedImages.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {uploadedImages.map((image) => (
                <div
                  key={image.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                >
                  <span className="max-w-[140px] truncate">{image.originalName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(image.sizeBytes / 1024).toFixed(1)}KB
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadedImages((prev) => prev.filter((img) => img.id !== image.id))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Editor + Send/Stop button - 响应式布局 */}
      <div className="flex flex-col items-end gap-2 sm:flex-row">
        {/* Rich text editor */}
        <div className="min-h-[72px] w-full flex-1 overflow-hidden rounded-lg border border-border bg-background">
          <WysiwygEditor
            value={message}
            onChange={setMessage}
            placeholder={
              !isConnected
                ? txt('等待连接...', 'Waiting for connection...')
                : isExecuting
                  ? txt('Agent 正在执行中...', 'Agent is running...')
                  : txt('输入消息，/ 调用命令...', 'Type a message, / for commands...')
            }
            disabled={isExecuting || isSending || !isConnected}
            agent={agent}
            workspaceId={workspaceId}
            onSend={handleSend}
            sendShortcut={sendShortcut}
            className="min-h-[44px] p-2 md:p-3"
          />
        </div>

        {/* Send/Stop button */}
        {isExecuting && stopButtonVisible ? (
          <button
            type="button"
            onClick={handleStop}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-red-500 px-3 text-white transition-colors hover:bg-red-600 sm:w-auto"
            title={txt('停止执行', 'Stop execution')}
          >
            <Square className="w-4 h-4" />
            <span className="hidden sm:inline">{txt('停止', 'Stop')}</span>
          </button>
        ) : (
          <>
            {onSave && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                title={txt('保存内容', 'Save content')}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-sm font-medium">{txt('保存', 'Save')}</span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend || (!message.trim() && uploadedImages.length === 0)}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-muted sm:w-auto"
              title={txt('发送消息', 'Send message')}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{txt('发送', 'Send')}</span>
            </button>
          </>
        )}
      </div>

      {statusBarVisible && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:gap-2">
          <div className="flex items-center gap-1">
            <span>{txt('连接:', 'Connection:')}</span>
            <span className={isConnected ? 'text-emerald-500' : 'text-red-500'}>
              {isConnected ? '✓' : '✗'}
            </span>
          </div>
          <span className="text-border">|</span>
          <span>{txt('执行:', 'Execution:')} {isExecuting ? txt('进行中', 'Running') : txt('空闲', 'Idle')}</span>

          {isConnected && !isExecuting && agent && (
            <>
              <span className="hidden text-border sm:inline">|</span>
              <span className="text-amber-500 hidden sm:inline">{txt('输入 / 调用命令', 'Type / for commands')}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
