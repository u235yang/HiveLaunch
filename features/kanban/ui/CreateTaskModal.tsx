'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@shared/ui'
import { Button } from '@shared/ui'
import { Badge } from '@shared/ui'
import { Switch } from '@shared/ui'
import { X, Hexagon, Loader2, GitBranch, ChevronDown, ImagePlus, Camera, RefreshCw } from 'lucide-react'
import { useProjectStore } from '@/features/shared/store'
import { useProjectBranches } from '@/features/agent-execution/hooks/useProjectBranches'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { ModelSelectorPopover } from '@/features/agent-execution/ui/model-selector'
import { AgentSelectorButton } from '@/features/agent-execution/ui/AgentSelectorButton'
import type { BaseCodingAgent } from '@shared/types'
import { useMobile } from '@/hooks/use-mobile'

// ==================== Types ====================

interface SwarmBinding {
  id: string
  projectId: string
  swarmTemplateId: string
  isActive: boolean
  swarm: {
    id: string
    name: string
    description: string | null
    cli: string
    defaultModelId?: string | null // 默认模型
    skillsCount: number
    agents: string[]
    mcpsCount: number
    accent: string | null
  }
}

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate?: (values: {
    description: string
    swarmId: string
    swarmName: string
    agentCli: string  // 添加 agentCli 字段
    modelId?: string // 添加 modelId 字段
    agentId?: string // 🔹 新增：agentId 字段
    executeImmediately: boolean
    branch?: string
    taskType: 'normal' | 'direct'  // 添加任务类型
    imageIds?: string[]
  }) => void
  defaultStatus?: 'todo' | 'inprogress'
  projectId?: string  // 添加 projectId prop
  texts?: CreateTaskModalTexts
}

interface CreateTaskModalTexts {
  imageUploadFailed: string
  title: string
  taskType: string
  normalTask: string
  normalTaskHint: string
  directTask: string
  directTaskHint: string
  directTaskNoticeTitle: string
  directTaskNoticeDesc: string
  taskDescription: string
  taskDescriptionPlaceholder: string
  taskDescriptionRequired: string
  images: string
  imagesHint: string
  selectImages: string
  takePhoto: string
  uploadingImages: string
  swarm: string
  active: string
  loadingSwarms: string
  selectSwarmPlaceholder: string
  swarmNotFound: string
  projectNoSwarmPrefix: string
  addSwarm: string
  selectProjectFirst: string
  selectSwarmRequired: string
  executeImmediately: string
  executeImmediatelyHint: string
  branch: string
  directTaskBranchHint: string
  loadingBranches: string
  selectBranch: string
  branchNotFound: string
  remote: string
  current: string
  selectBranchRequired: string
  repoPathNotConfigured: string
  loadingAgents: string
  noAvailableAgents: string
  refresh: string
  model: string
  loadingModels: string
  noAvailableModels: string
  cancel: string
  createTask: string
}

const defaultTexts: CreateTaskModalTexts = {
  imageUploadFailed: '图片上传失败',
  title: '创建新任务',
  taskType: '任务类型',
  normalTask: '普通任务',
  normalTaskHint: '创建独立分支开发',
  directTask: '直接任务',
  directTaskHint: '在当前分支工作',
  directTaskNoticeTitle: '⚠️ 直接任务说明：',
  directTaskNoticeDesc: '不创建 Worktree，直接在选定分支上工作。适用于提交配置文件（如 .opencode）、Git 维护操作（解决冲突、rebase）等场景。',
  taskDescription: '任务描述',
  taskDescriptionPlaceholder: '描述你想要完成的任务...',
  taskDescriptionRequired: '任务描述不能为空',
  images: '图片',
  imagesHint: '可选，上传后会在执行时自动传给 Agent',
  selectImages: '选择图片',
  takePhoto: '拍照',
  uploadingImages: '正在上传图片...',
  swarm: '蜂群',
  active: '激活',
  loadingSwarms: '加载蜂群...',
  selectSwarmPlaceholder: '选择蜂群，输入 / 查看所有可用蜂群...',
  swarmNotFound: '未找到匹配的蜂群',
  projectNoSwarmPrefix: '当前项目未绑定蜂群，请先',
  addSwarm: '添加蜂群',
  selectProjectFirst: '请先选择一个项目',
  selectSwarmRequired: '请选择一个蜂群',
  executeImmediately: '创建后立即开始执行',
  executeImmediatelyHint: '关闭时任务将进入待办列',
  branch: '分支',
  directTaskBranchHint: '直接任务需要指定工作分支',
  loadingBranches: '加载分支...',
  selectBranch: '选择分支',
  branchNotFound: '未找到分支',
  remote: '远程',
  current: '当前',
  selectBranchRequired: '请选择一个分支',
  repoPathNotConfigured: '未配置仓库路径，将使用默认位置: <仓库目录>/.hive-worktrees/',
  loadingAgents: '加载 Agent 列表中...',
  noAvailableAgents: '暂无可用 Agent',
  refresh: '刷新',
  model: '模型',
  loadingModels: '加载模型列表中...',
  noAvailableModels: '暂无可用模型',
  cancel: '取消',
  createTask: '创建任务',
}

interface UploadedImage {
  id: string
  originalName: string
  sizeBytes: number
}

// ==================== Component ====================

export function CreateTaskModal({
  isOpen,
  onClose,
  onCreate,
  defaultStatus = 'todo',
  projectId: propProjectId,  // 从 props 接收 projectId
  texts = defaultTexts,
}: CreateTaskModalProps) {
  // 优先使用 prop 传入的 projectId，否则从 store 中获取
  const storeProjectId = useProjectStore((state) => state.currentProject?.id)
  const projectId = propProjectId ?? storeProjectId
  const projectRepoPath = useProjectStore((state) => state.currentProject?.repoPath)
  
  const [description, setDescription] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [selectedSwarm, setSelectedSwarm] = useState<SwarmBinding | null>(null)
  const [swarms, setSwarms] = useState<SwarmBinding[]>([])
  const [isLoadingSwarms, setIsLoadingSwarms] = useState(false)
  const [showSwarmSuggestions, setShowSwarmSuggestions] = useState(false)
  const [swarmInput, setSwarmInput] = useState('')
  const [taskType, setTaskType] = useState<'normal' | 'direct'>('normal')
  const [executeImmediately, setExecuteImmediately] = useState(true)
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [branchDropdownPosition, setBranchDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const branchButtonRef = useRef<HTMLButtonElement>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [selectedAgent, setSelectedAgent] = useState<string>('')  // 🔹 新增：选中的 agent ID
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const isMobile = useMobile()
  const [swarmDropdownPosition, setSwarmDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const swarmInputRef = useRef<HTMLInputElement>(null)

  // 用于跟踪下拉菜单的 Portal 元素
  const branchDropdownRef = useRef<HTMLDivElement>(null)
  const swarmDropdownRef = useRef<HTMLDivElement>(null)

  // 获取项目分支（优先使用项目 repoPath，其次全局 workspace_dir）
  const { branches, isLoading: isLoadingBranches, currentPath, error: branchError } = useProjectBranches({ repoPath: projectRepoPath })

  // 加载项目绑定的蜂群
  useEffect(() => {
    if (!isOpen || !projectId) {
      return
    }

    const url = `/api/projects/${projectId}/swarm-bindings`
    console.log('[CreateTaskModal] Fetching swarms from:', url)
    setIsLoadingSwarms(true)
    fetch(url)
      .then((res) => {
        console.log('[CreateTaskModal] Response status:', res.status, 'ok:', res.ok)
        return res.json()
      })
      .then((data: SwarmBinding[]) => {
        console.log('[CreateTaskModal] Swarms data received:', data)
        console.log('[CreateTaskModal] Swarms detail:', data.map(s => ({ id: s.id, swarmTemplateId: s.swarmTemplateId, isActive: s.isActive, swarmName: s.swarm?.name })))
        setSwarms(data)
        // 默认选择激活的蜂群
        const activeSwarm = data.find((s) => s.isActive)
        console.log('[CreateTaskModal] Active swarm found:', activeSwarm)
        if (activeSwarm) {
          setSelectedSwarm(activeSwarm)
          setSwarmInput(activeSwarm.swarm.name)
        } else if (data.length > 0) {
          // 如果没有激活的蜂群，默认选择第一个
          console.log('[CreateTaskModal] No active swarm, using first swarm:', data[0])
          setSelectedSwarm(data[0])
          setSwarmInput(data[0].swarm.name)
        }
      })
      .catch((err) => {
        console.error('[CreateTaskModal] Failed to load swarms:', err)
      })
      .finally(() => {
        setIsLoadingSwarms(false)
      })
  }, [isOpen, projectId, propProjectId, storeProjectId])

  // 字符计数
  useEffect(() => {
    setCharCount(description?.length || 0)
  }, [description])

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // 分支下拉菜单 - 检查按钮和 Portal 渲染的下拉菜单
      if (showBranchDropdown) {
        const isInsideButton = branchButtonRef.current?.contains(target)
        const isInsideDropdown = branchDropdownRef.current?.contains(target)
        if (!isInsideButton && !isInsideDropdown) {
          setShowBranchDropdown(false)
        }
      }

      // 蜂群建议 - 检查输入框和 Portal 渲染的下拉菜单
      if (showSwarmSuggestions) {
        const isInsideInput = swarmInputRef.current?.contains(target)
        const isInsideDropdown = swarmDropdownRef.current?.contains(target)
        if (!isInsideInput && !isInsideDropdown) {
          setShowSwarmSuggestions(false)
        }
      }
    }

    if (showBranchDropdown || showSwarmSuggestions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showBranchDropdown, showSwarmSuggestions])

  // 分支下拉菜单位置更新 - 使用 requestAnimationFrame 确保 DOM 已渲染
  useEffect(() => {
    if (showBranchDropdown) {
      const rafId = requestAnimationFrame(() => {
        if (branchButtonRef.current) {
          const rect = branchButtonRef.current.getBoundingClientRect()
          setBranchDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: rect.width,
          })
        }
      })
      return () => cancelAnimationFrame(rafId)
    } else {
      setBranchDropdownPosition(null)
    }
  }, [showBranchDropdown])

  // 蜂群下拉菜单位置更新
  useEffect(() => {
    if (showSwarmSuggestions) {
      const rafId = requestAnimationFrame(() => {
        if (swarmInputRef.current) {
          const rect = swarmInputRef.current.getBoundingClientRect()
          setSwarmDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: rect.width,
          })
        }
      })
      return () => cancelAnimationFrame(rafId)
    } else {
      setSwarmDropdownPosition(null)
    }
  }, [showSwarmSuggestions])

  // 验证
  const isDescriptionValid = description.trim().length > 0
  const isSwarmValid = selectedSwarm !== null
  // 分支验证：直接任务始终需要选择分支；普通任务只在立即执行时需要分支
  const isBranchValid = taskType === 'direct'
    ? !!selectedBranch  // 直接任务必须选择分支
    : (!executeImmediately || !!selectedBranch || !currentPath)  // 普通任务根据执行模式判断
  const isValid = isDescriptionValid && isSwarmValid && isBranchValid

  // 规范化 cli 值为 BaseCodingAgent 类型
  const normalizeCliToAgent = (cli: string | undefined): BaseCodingAgent => {
    if (!cli) return 'OPENCODE'

    const normalized = cli.toUpperCase().replace(/-/g, '_')

    // 映射表：处理常见的别名
    const mapping: Record<string, BaseCodingAgent> = {
      'OPENCODE': 'OPENCODE',
      'OPENC0DE': 'OPENCODE',
      'CLAUDE_CODE': 'CLAUDE_CODE',
      'CLAUDE': 'CLAUDE_CODE',
      'CURSOR_AGENT': 'CURSOR',
      'CURSOR': 'CURSOR',
      'QWEN_CODE': 'QWEN',
      'QWEN': 'QWEN',
      'COPILOT': 'COPILOT',
      'DROID': 'DROID',
      'AMP': 'AMP',
      'GEMINI': 'GEMINI',
    }

    return mapping[normalized] || 'OPENCODE'
  }

  // 动态获取模型列表（基于 OpenCode 发现）
  const agentCli = normalizeCliToAgent(selectedSwarm?.swarm.cli)
  const discovery = useExecutorDiscovery(
    agentCli,
    {
      workspaceId: undefined,
      repoId: projectId,
    }
  )

  // 蜂群输入处理
  const handleSwarmInputChange = (value: string) => {
    setSwarmInput(value)
    setShowSwarmSuggestions(value.length > 0 || value.startsWith('/'))
  }

  // 辅助函数：获取完整的模型 ID (provider_id/id 格式)
  const getFullModelId = (model: { id: string; provider_id?: string | null }): string => {
    if (model.provider_id) {
      return `${model.provider_id}/${model.id}`
    }
    return model.id
  }

  // 选择蜂群
  const handleSelectSwarm = (swarm: SwarmBinding) => {
    setSelectedSwarm(swarm)
    setSwarmInput(swarm.swarm.name)
    setShowSwarmSuggestions(false)
    // 自动填充蜂群的默认模型（验证有效性）
    if (swarm.swarm.defaultModelId) {
      // 尝试匹配：可能是完整格式 (provider_id/id) 或仅仅是 id
      const validModel = discovery.models.find(m =>
        m.id === swarm.swarm.defaultModelId ||
        getFullModelId(m) === swarm.swarm.defaultModelId ||
        `${m.provider_id}/${m.id}` === swarm.swarm.defaultModelId
      )
      if (validModel) {
        // 使用完整的 provider_id/id 格式
        setSelectedModel(getFullModelId(validModel))
        console.log('[CreateTaskModal] Set default model:', getFullModelId(validModel))
      } else {
        // 无效模型，使用默认（空字符串）
        setSelectedModel('')
        console.warn(`[CreateTaskModal] Invalid defaultModelId: ${swarm.swarm.defaultModelId}, available models:`, discovery.models.map(m => ({ id: m.id, provider_id: m.provider_id, full: getFullModelId(m) })))
      }
    }
  }

  // 移除已选蜂群
  const handleRemoveSwarm = () => {
    setSelectedSwarm(null)
    setSwarmInput('')
  }

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

  const handleSelectImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
          throw new Error(errorText || texts.imageUploadFailed)
        }
        const image = await response.json()
        uploaded.push({
          id: image.id,
          originalName: image.originalName,
          sizeBytes: image.sizeBytes,
        })
      }
      setUploadedImages((prev) => {
        const existing = new Set(prev.map((item) => item.id))
        const merged = [...prev]
        for (const item of uploaded) {
          if (!existing.has(item.id)) {
            merged.push(item)
          }
        }
        return merged
      })
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : texts.imageUploadFailed)
    } finally {
      setIsUploadingImages(false)
      event.target.value = ''
    }
  }

  const handleRemoveImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id))
  }

  // 过滤蜂群列表
  const filteredSwarms = swarms.filter((s) => 
    s.swarm.name.toLowerCase().includes(swarmInput.toLowerCase())
  )

  // 获取蜂群的 accent 颜色
  const getAccentColor = (accent: string | null) => {
    const colors: Record<string, string> = {
      amber: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      violet: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
      teal: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30',
    }
    return colors[accent || 'amber'] || colors.amber
  }

  // 提交
  const handleSubmit = () => {
    console.log('[CreateTaskModal] handleSubmit called:', { isValid, selectedSwarm })

    if (!isValid || !selectedSwarm) {
      console.log('[CreateTaskModal] Submit blocked:', { isValid: !isValid, noSwarm: !selectedSwarm })
      return
    }

    const submitData = {
      description: description.trim(),
      swarmId: selectedSwarm.swarmTemplateId,
      swarmName: selectedSwarm.swarm.name,
      agentCli: selectedSwarm.swarm.cli,
      modelId: selectedModel || undefined,
      executeImmediately,
      agentId: selectedAgent || undefined, // 🔹 新增：Agent ID
      // 直接任务始终传递 branch；普通任务只在立即执行时传递 branch
      branch: taskType === 'direct' ? selectedBranch : (executeImmediately ? selectedBranch : undefined),
      taskType,
      imageIds: uploadedImages.map((image) => image.id),
    }

    onCreate?.(submitData)

    // 重置表单
    setDescription('')
    // 不重置蜂群选择，保留上次选择
    setTaskType('normal')
    setExecuteImmediately(true)
    setSelectedBranch('')
    setSelectedModel('')
    setUploadedImages([])
    setImageUploadError(null)
    onClose()
  }

  // 关闭时重置
  useEffect(() => {
    if (!isOpen) {
      setDescription('')
      setShowSwarmSuggestions(false)
      setExecuteImmediately(true)
      setUploadedImages([])
      setImageUploadError(null)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-[90dvh] max-w-[512px] flex-col bg-card p-0 text-card-foreground sm:h-auto sm:max-h-[85dvh]">
        <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 md:px-8 md:pb-4 md:pt-6">
          <DialogTitle className="text-lg font-semibold text-foreground md:text-xl">
            {texts.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 md:space-y-5 p-4 md:p-8 overflow-y-auto overflow-x-visible flex-1">
          {/* 任务类型选择 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {texts.taskType}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTaskType('normal')}
                className={`flex-1 px-3 py-2.5 text-sm rounded-lg border transition-all ${
                  taskType === 'normal'
                    ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:border-ring/40'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-0.5">
                  <span className="text-lg">🌳</span>
                  <span className="font-medium">{texts.normalTask}</span>
                </div>
                <div className="text-xs opacity-70">{texts.normalTaskHint}</div>
              </button>
              <button
                type="button"
                onClick={() => setTaskType('direct')}
                className={`flex-1 px-3 py-2.5 text-sm rounded-lg border transition-all ${
                  taskType === 'direct'
                    ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:border-ring/40'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-0.5">
                  <span className="text-lg">⚡</span>
                  <span className="font-medium">{texts.directTask}</span>
                </div>
                <div className="text-xs opacity-70">{texts.directTaskHint}</div>
              </button>
            </div>
            {taskType === 'direct' && (
              <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  <span className="font-semibold">{texts.directTaskNoticeTitle}</span>
                  {texts.directTaskNoticeDesc}
                </p>
              </div>
            )}
          </div>

          {/* 任务描述 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {texts.taskDescription} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <textarea
                placeholder={texts.taskDescriptionPlaceholder}
                className="min-h-[120px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-background md:min-h-[200px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                {charCount}/2000
              </span>
            </div>
            {!isDescriptionValid && description.length > 0 && (
              <p className="text-sm text-red-500">{texts.taskDescriptionRequired}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {texts.images}
            </label>
            <div className="rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {texts.imagesHint}
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:border-amber-300 hover:text-amber-700">
                    <ImagePlus className="h-3.5 w-3.5" />
                    {texts.selectImages}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/svg+xml"
                      multiple
                      onChange={handleSelectImages}
                      className="hidden"
                    />
                  </label>
                  {isMobile && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:border-amber-300 hover:text-amber-700">
                      <Camera className="h-3.5 w-3.5" />
                      {texts.takePhoto}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleSelectImages}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
              {isUploadingImages && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {texts.uploadingImages}
                </div>
              )}
              {imageUploadError && (
                <p className="mt-2 text-xs text-red-500">{imageUploadError}</p>
              )}
              {uploadedImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {uploadedImages.map((image) => (
                    <Badge
                      key={image.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 border border-border bg-card px-2 py-1 text-foreground"
                    >
                      <span className="max-w-[180px] truncate">{image.originalName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {(image.sizeBytes / 1024).toFixed(1)}KB
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(image.id)}
                        className="hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 蜂群选择 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {texts.swarm} <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              {selectedSwarm ? (
                // 已选蜂群 - 显示 Badge
                <div className="flex min-h-[46px] items-center gap-2 rounded-lg border border-input bg-background p-2.5">
                  <Badge className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border ${getAccentColor(selectedSwarm.swarm.accent)}`}>
                    <Hexagon className="h-3 w-3" />
                    <span>{selectedSwarm.swarm.name}</span>
                    {selectedSwarm.isActive && (
                      <span className="ml-1 text-[10px] opacity-70">● {texts.active}</span>
                    )}
                    <button
                      type="button"
                      onClick={handleRemoveSwarm}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </div>
              ) : (
                // 输入框
                <div className="relative">
                  <input
                    type="text"
                    placeholder={isLoadingSwarms ? texts.loadingSwarms : texts.selectSwarmPlaceholder}
                    className="h-[46px] w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-background disabled:bg-muted disabled:text-muted-foreground"
                    value={swarmInput}
                    onChange={(e) => handleSwarmInputChange(e.target.value)}
                    onFocus={() => setShowSwarmSuggestions(true)}
                    disabled={isLoadingSwarms || swarms.length === 0}
                  />
                  {isLoadingSwarms && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}

              {/* 蜂群下拉建议 - 使用 Portal 渲染到 body */}
              {showSwarmSuggestions && !selectedSwarm && swarms.length > 0 && swarmDropdownPosition && createPortal(
                <div
                  ref={swarmDropdownRef}
                  className="fixed z-50 max-h-[240px] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
                  style={{
                    top: `${swarmDropdownPosition.top}px`,
                    left: `${swarmDropdownPosition.left}px`,
                    width: `${swarmDropdownPosition.width}px`,
                  }}
                >
                  {filteredSwarms.length === 0 ? (
                    <div className="px-3 py-2.5 text-sm text-muted-foreground">
                      {texts.swarmNotFound}
                    </div>
                  ) : (
                    filteredSwarms.map((swarm) => (
                      <button
                        key={swarm.id}
                        type="button"
                        onClick={() => handleSelectSwarm(swarm)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                          swarm.isActive ? 'bg-amber-50 dark:bg-amber-500/10' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getAccentColor(swarm.swarm.accent)}`}>
                          <Hexagon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {swarm.swarm.name}
                            </span>
                            {swarm.isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                {texts.active}
                              </span>
                            )}
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {swarm.swarm.agents.length} Agents · {swarm.swarm.skillsCount} Skills · {swarm.swarm.mcpsCount} MCP
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>,
                document.body
              )}
            </div>
            
            {swarms.length === 0 && !isLoadingSwarms && projectId && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-600">{texts.projectNoSwarmPrefix}</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    window.location.href = `/projects/${projectId}/config`
                  }}
                  className="text-amber-600 underline hover:text-amber-700 font-medium"
                >
                  {texts.addSwarm}
                </button>
              </div>
            )}
            {swarms.length === 0 && !isLoadingSwarms && !projectId && (
              <p className="text-sm text-amber-600">
                {texts.selectProjectFirst}
              </p>
            )}
            {!isSwarmValid && swarmInput.length > 0 && (
              <p className="text-sm text-red-500">{texts.selectSwarmRequired}</p>
            )}
          </div>

          {/* 立即执行开关 */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-3">
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={executeImmediately}
                  onCheckedChange={setExecuteImmediately}
                />
                <span className="text-sm font-medium text-foreground">
                  {texts.executeImmediately}
                </span>
              </label>
              <span className="text-xs text-muted-foreground">
                {texts.executeImmediatelyHint}
              </span>
            </div>
          </div>

          {/* 分支选择 - 立即执行时或直接任务时显示 */}
          {(executeImmediately || taskType === 'direct') && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                {texts.branch} <span className="text-red-500">*</span>
                {taskType === 'direct' && !executeImmediately && (
                  <span className="text-xs text-amber-600 ml-1">（{texts.directTaskBranchHint}）</span>
                )}
              </label>
              <div className="relative">
                <button
                  ref={branchButtonRef}
                  type="button"
                  onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                  disabled={isLoadingBranches}
                  className="flex h-[46px] w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-background disabled:bg-muted disabled:text-muted-foreground"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className={selectedBranch ? 'text-foreground' : 'text-muted-foreground'}>
                      {isLoadingBranches
                        ? texts.loadingBranches
                        : selectedBranch || texts.selectBranch}
                    </span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showBranchDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* 分支下拉 - 使用 Portal 渲染到 body */}
                {showBranchDropdown && !isLoadingBranches && branchDropdownPosition && createPortal(
                  <div
                    ref={branchDropdownRef}
                    className="fixed z-50 max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
                    style={{
                      top: `${branchDropdownPosition.top}px`,
                      left: `${branchDropdownPosition.left}px`,
                      width: `${branchDropdownPosition.width}px`,
                    }}
                  >
                    {branches.length === 0 ? (
                      <div className="px-3 py-2.5 text-sm text-muted-foreground">
                        {texts.branchNotFound}
                      </div>
                    ) : (
                      branches.map((branch, index) => (
                        <button
                          key={`${branch.name}-${branch.is_remote ? 'remote' : 'local'}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedBranch(branch.name)
                            setShowBranchDropdown(false)
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                            branch.name === selectedBranch ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono truncate">{branch.name}</span>
                          {branch.is_remote && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 ml-auto dark:bg-blue-500/20 dark:text-blue-300">
                              {texts.remote}
                            </span>
                          )}
                          {branch.is_current && !branch.is_remote && (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                              {texts.current}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>,
                  document.body
                )}
              </div>
              {/* 分支验证：立即执行时必须有分支；直接任务始终必须有分支 */}
              {((!selectedBranch && executeImmediately) || (!selectedBranch && taskType === 'direct')) && (
                <p className="text-sm text-red-500">{texts.selectBranchRequired}</p>
              )}
              {branchError && (
                <p className="text-sm text-red-500">{branchError}</p>
              )}
              {!currentPath && (
                <p className="text-sm text-amber-600">
                  {texts.repoPathNotConfigured}
                </p>
              )}
            </div>
          )}

          {/* Agent 和模型选择 - 仅在立即执行时显示 */}
          {executeImmediately && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                {/* Agent 选择器 */}
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Agent
                  </label>
                  {discovery.agents.length > 0 ? (
                    <AgentSelectorButton
                      value={selectedAgent || undefined}
                      onChange={(agentId) => {
                        setSelectedAgent(agentId)
                      }}
                      agents={discovery.agents.map(a => ({
                        id: a.id,
                        name: a.label,
                        description: a.description || '',
                        is_available: true,
                      }))}
                      isLoading={discovery.loadingAgents}
                      onRefresh={discovery.refreshModels}
                      isRefreshing={discovery.isRefreshing}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {discovery.loadingAgents ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{texts.loadingAgents}</span>
                        </>
                      ) : (
                        <>
                          <span>{texts.noAvailableAgents}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={discovery.refreshModels}
                            disabled={discovery.isRefreshing}
                            className="h-7 px-2 text-xs"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${discovery.isRefreshing ? 'animate-spin' : ''}`} />
                            {texts.refresh}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 模型选择器 */}
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {texts.model}
                  </label>
                  {discovery.models.length > 0 ? (
                    <ModelSelectorPopover
                      config={discovery.modelSelector}
                      selectedModelId={selectedModel || undefined}
                      onModelSelect={(modelId) => {
                        setSelectedModel(modelId)
                      }}
                      isLoading={discovery.loadingModels}
                      onRefresh={discovery.refreshModels}
                      isRefreshing={discovery.isRefreshing}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {discovery.loadingModels ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{texts.loadingModels}</span>
                        </>
                      ) : (
                        <>
                          <span>{texts.noAvailableModels}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={discovery.refreshModels}
                            disabled={discovery.isRefreshing}
                            className="h-7 px-2 text-xs"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${discovery.isRefreshing ? 'animate-spin' : ''}`} />
                            {texts.refresh}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <DialogFooter className="shrink-0 border-t border-border px-4 py-4 md:gap-4 md:px-8 md:py-6">
          <Button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground md:flex-none md:px-6"
          >
            {texts.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className="px-4 md:px-8 py-2.5 text-sm font-semibold text-white bg-[#F59E0B] hover:bg-[#D97706] rounded-lg shadow-sm shadow-amber-200 disabled:opacity-50 disabled:cursor-not-allowed flex-1 md:flex-none"
          >
            {texts.createTask}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
