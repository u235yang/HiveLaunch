'use client'

import { useEffect, useMemo, useState, useRef, type ChangeEvent, useCallback } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, Settings2, X, FileText, RotateCcw, Plus, Check } from 'lucide-react'
import { ConfirmDialog } from '@/components/kanban/ConfirmDialog'

import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { parse, stripComments } from 'jsonc-parser'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  EmbeddedConfigEditor,
  opencodeConfigSchema,
  defaultMockConfig,
  type OpencodeConfig,
} from '@shared/ui'
import type { SwarmSummary } from './SwarmCard'
import type { GlobalSwarmSummary } from './GlobalSwarmCard'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'
import { getSkillsHubStatus, type InstalledSkill } from '@/features/settings/lib/skills-api'
import { useUIStore } from '@/features/shared/store'

// 类型守卫：检查是否为旧的 SwarmSummary 类型
function isSwarmSummary(swarm: SwarmSummary | GlobalSwarmSummary): swarm is SwarmSummary {
  return 'ohMyOpencode' in swarm
}

export interface SwarmTemplate {
  id: string
  name: string
  description: string
  cli: string
  agents: string[]
  skillsCount: number
  mcpsCount: number
  defaultOhMyOpencode: string
  defaultOpencode: string
  defaultSkills: string[]
  // 新增：项目规则文档
  defaultClaudeMd?: string
  defaultAgentsMd?: string
}

export interface SwarmCreatePayload {
  template: SwarmTemplate
  cli: string
  defaultModelId?: string // 默认模型
  ohMyOpencode: string
  opencodeConfig: string
  skills: string[]
  uploadedSkillNames: string[]
  uploads: File[]
  // 新增：项目规则文档
  claudeMd?: string
  agentsMd?: string
}

interface SwarmConfigFlowProps {
  open: boolean
  mode: 'create' | 'edit'
  templates: SwarmTemplate[]
  currentSwarm?: SwarmSummary | null
  initialSwarm?: SwarmSummary | GlobalSwarmSummary | null
  onClose: () => void
  onCreate: (payload: SwarmCreatePayload) => Promise<{ success: boolean; error?: string }>
  onUpdate: (id: string, payload: SwarmCreatePayload) => Promise<{ success: boolean; error?: string }>
}

/**
 * 蜂群配置流程
 * 
 * 创建模式：选择模板 → 预览确认 → 完成
 * 编辑模式：配置编辑 → 预览确认 → 完成
 */
export function SwarmConfigFlow({
  open,
  mode,
  templates,
  currentSwarm,
  initialSwarm,
  onClose,
  onCreate,
  onUpdate,
}: SwarmConfigFlowProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const [isDeleting, setIsDeleting] = useState(false)
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState<SwarmTemplate | null>(null)
  const [cli, setCli] = useState('opencode')
  const [ohMyOpencode, setOhMyOpencode] = useState('')
  const [opencodeConfig, setOpencodeConfig] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [existingUploads, setExistingUploads] = useState<string[]>([])
  const [uploads, setUploads] = useState<File[]>([])
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])
  const [isLoadingInstalledSkills, setIsLoadingInstalledSkills] = useState(false)
  const [installedSkillsError, setInstalledSkillsError] = useState<string | null>(null)

  // 新增：项目规则文档
  const [claudeMd, setClaudeMd] = useState('')
  const [agentsMd, setAgentsMd] = useState('')

  // 重置配置确认对话框
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // 保存状态
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 可用模型列表（Radix Select 不允许空字符串 value，使用 __default__ 作为占位）
  const availableModels = [
    { id: '__default__', name: txt('使用 CLI 默认模型', 'Use CLI default model') },
    { id: 'minimax-cn-coding-plan/MiniMax-M2.5', name: 'MiniMax M2.5' },
    { id: 'minimax-cn-coding-plan/MiniMax-M2.1', name: 'MiniMax M2.1' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'qwen-coder-turbo', name: 'Qwen Coder Turbo' },
  ]

  // 内部 state 使用 __default__ 代替空字符串
  const [internalModelId, setInternalModelId] = useState('__default__')

  // 重置状态
  useEffect(() => {
    if (!open) {
      setStep(1)
      setSelected(null)
      setCli('opencode')
      setInternalModelId('__default__')
      setOhMyOpencode('')
      setOpencodeConfig('')
      setSkills([])
      setExistingUploads([])
      setUploads([])
      setInstalledSkills([])
      setInstalledSkillsError(null)
      // 新增字段重置
      setClaudeMd('')
      setAgentsMd('')
      return
    }

    if (initialSwarm) {
      const ohMyOpencode = isSwarmSummary(initialSwarm)
        ? initialSwarm.ohMyOpencode
        : (initialSwarm.ohMyOpencodeJson || '')
      const opencodeConfig = isSwarmSummary(initialSwarm)
        ? initialSwarm.opencodeConfig
        : (initialSwarm.opencodeJson || '')
      const skills = isSwarmSummary(initialSwarm)
        ? initialSwarm.skills
        : (initialSwarm.skillsJson ? JSON.parse(initialSwarm.skillsJson) : [])
      const uploadedSkills = isSwarmSummary(initialSwarm)
        ? initialSwarm.uploadedSkills
        : []

      // 新增字段 - 从 GlobalSwarmSummary 获取
      const swarmClaudeMd = isSwarmSummary(initialSwarm) ? '' : (initialSwarm.claudeMd || '')
      const swarmAgentsMd = isSwarmSummary(initialSwarm) ? '' : (initialSwarm.agentsMd || '')

      const template: SwarmTemplate = {
        id: initialSwarm.id,
        name: initialSwarm.name,
        description: initialSwarm.description || '',
        cli: initialSwarm.cli,
        agents: initialSwarm.agents,
        skillsCount: initialSwarm.skillsCount,
        mcpsCount: initialSwarm.mcpsCount,
        defaultOhMyOpencode: ohMyOpencode,
        defaultOpencode: opencodeConfig,
        defaultSkills: skills,
        defaultClaudeMd: swarmClaudeMd,
        defaultAgentsMd: swarmAgentsMd,
      }
      setSelected(template)
      setCli(initialSwarm.cli)
      setInternalModelId(initialSwarm.defaultModelId || '__default__')
      setOhMyOpencode(ohMyOpencode)
      setOpencodeConfig(opencodeConfig)
      setSkills(skills)
      setExistingUploads(uploadedSkills)
      setUploads([])
      setClaudeMd(swarmClaudeMd)
      setAgentsMd(swarmAgentsMd)
      setStep(mode === 'edit' ? 1 : 1.5)
      return
    }

    if (mode === 'create') {
      setStep(1)
      setSelected(null)
      setCli('opencode')
      setOhMyOpencode('')
      setOpencodeConfig('')
      setSkills([])
      setExistingUploads([])
      setUploads([])
      // 新增字段重置
      setClaudeMd('')
      setAgentsMd('')
    }
  }, [open, mode, initialSwarm])

  useEffect(() => {
    if (!open || cli !== 'opencode') {
      return
    }
    let cancelled = false
    setIsLoadingInstalledSkills(true)
    setInstalledSkillsError(null)
    getSkillsHubStatus()
      .then((status) => {
        if (cancelled) return
        setInstalledSkills(status.installed_skills)
      })
      .catch((error) => {
        if (cancelled) return
        setInstalledSkills([])
        setInstalledSkillsError(error instanceof Error ? error.message : txt('加载失败', 'Load failed'))
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingInstalledSkills(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, cli])

  const currentSummary = useMemo(() => {
    if (!currentSwarm) {
      return {
        name: txt('暂无激活蜂群', 'No active swarm'),
        cli: '—',
        agents: 0,
        skills: 0,
        mcps: 0,
      }
    }
    return {
      name: currentSwarm.name,
      cli: currentSwarm.cli,
      agents: currentSwarm.agents.length,
      skills: currentSwarm.skillsCount,
      mcps: currentSwarm.mcpsCount,
    }
  }, [currentSwarm])

  // 选择模板（使用默认配置）
  const handleQuickAdd = (template: SwarmTemplate) => {
    setSelected(template)
    setCli(template.cli)
    setOhMyOpencode(template.defaultOhMyOpencode)
    setOpencodeConfig(template.defaultOpencode)
    setSkills(template.defaultSkills)
    setExistingUploads([])
    setUploads([])
    // 新增字段
    setClaudeMd(template.defaultClaudeMd || '')
    setAgentsMd(template.defaultAgentsMd || '')
    // 直接跳到配置编辑
    setStep(1.5)
  }

  // 选择模板（自定义配置）
  const handleCustomize = (template: SwarmTemplate) => {
    setSelected(template)
    setCli(template.cli)
    setOhMyOpencode(template.defaultOhMyOpencode)
    setOpencodeConfig(template.defaultOpencode)
    setSkills(template.defaultSkills)
    setExistingUploads([])
    setUploads([])
    // 新增字段
    setClaudeMd(template.defaultClaudeMd || '')
    setAgentsMd(template.defaultAgentsMd || '')
    // 跳到配置编辑
    setStep(1.5)
  }

  // 保存配置
  const handleSave = async () => {
    if (!selected) return
    
    setIsSaving(true)
    setSaveError(null)
    
    const payload: SwarmCreatePayload = {
      template: selected,
      cli,
      defaultModelId: internalModelId === '__default__' ? undefined : internalModelId,
      ohMyOpencode,
      opencodeConfig,
      skills,
      uploadedSkillNames: existingUploads,
      uploads,
      // 新增字段
      claudeMd,
      agentsMd,
    }
    
    try {
      let result: { success: boolean; error?: string }
      
      if (mode === 'create') {
        result = await onCreate(payload)
      } else {
        result = await onUpdate(selected.id, payload)
      }
      
      if (result.success) {
        onClose()
      } else {
        setSaveError(result.error || '保存失败')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  // 重置配置并自动保存
  const handleResetConfig = async () => {
    setShowResetConfirm(false)
    const resetConfigStr = JSON.stringify(defaultMockConfig, null, 2)
    setOhMyOpencode(resetConfigStr)

    if (mode === 'edit' && initialSwarm && selected) {
      const payload: SwarmCreatePayload = {
        template: selected,
        cli,
        defaultModelId: internalModelId === '__default__' ? undefined : internalModelId,
        ohMyOpencode: resetConfigStr,
        opencodeConfig,
        skills,
        uploadedSkillNames: existingUploads,
        uploads,
        claudeMd,
        agentsMd,
      }
      await onUpdate(selected.id, payload)
    }
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setUploads((prev) => [...prev, ...files])
    event.target.value = ''
  }

  const handleRemoveUpload = (name: string) => {
    setUploads((prev) => prev.filter((file) => file.name !== name))
  }

  const handleRemoveExistingUpload = (name: string) => {
    setExistingUploads((prev) => prev.filter((file) => file !== name))
  }

  const handleAddHubSkill = (skillName: string) => {
    setSkills((prev) => (prev.includes(skillName) ? prev : [...prev, skillName]))
  }

  const handleRemoveSelectedSkill = (skillName: string) => {
    setSkills((prev) => prev.filter((item) => item !== skillName))
  }

  const totalSkillsCount = skills.length + existingUploads.length + uploads.length

  // 步骤定义
  // 创建模式：1=选择模板, 1.5=配置编辑
  // 编辑模式：1=配置编辑
  const steps = mode === 'create'
    ? [txt('选择模板', 'Select Template'), txt('配置编辑', 'Edit Config')]
    : [txt('配置编辑', 'Edit Config')]

  const stepMap = {
    select: 1,
    edit: mode === 'create' ? 1.5 : 1,
  }

  if (!open) return null

  const showSelect = mode === 'create' && step === stepMap.select
  const showEdit = step === stepMap.edit && selected

  // 获取当前步骤索引（用于步骤指示器）
  const getCurrentStepIndex = () => {
    if (step === 1 && mode === 'create') return 1
    if (step === 1.5) return 2 // 配置编辑算第二步
    if (step === 1 && mode === 'edit') return 1
    return 1
  }

  return (
    <>
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-950 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500">{txt('设置 / 蜂群配置', 'Settings / Swarm Config')}</div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {mode === 'create' ? txt('添加蜂群', 'Add Swarm') : txt('编辑蜂群', 'Edit Swarm')}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="px-2 text-gray-500 dark:text-gray-400">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-8 text-xs text-gray-500 dark:text-gray-400 mb-6">
          {steps.map((label, index) => (
            <div
              key={label}
              className={`flex items-center gap-1 ${getCurrentStepIndex() >= index + 1 ? 'text-amber-600 font-semibold' : ''
                }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${getCurrentStepIndex() >= index + 1
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                }`}>
                {index + 1}
              </span>
              {label}
            </div>
          ))}
        </div>

        {/* Step 1: 选择模板（仅创建模式） */}
        {showSelect && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{txt('选择蜂群模板', 'Select Swarm Template')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{txt('从模板库选择一个蜂群配置', 'Choose a swarm config from templates')}</p>
            </div>
            <div className="space-y-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="border border-gray-200 rounded-xl p-5 bg-white hover:border-amber-300 hover:shadow-sm transition-all dark:border-gray-800 dark:bg-gray-900 dark:hover:border-amber-500/60"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{template.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{template.description}</p>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 flex flex-wrap gap-3">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          CLI: {template.cli}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          {template.agents.length} Agents
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          {template.skillsCount} Skills
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          {template.mcpsCount} MCP
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" onClick={() => handleQuickAdd(template)}>
                        {txt('快速添加', 'Quick Add')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCustomize(template)}
                        className="text-gray-600 dark:text-gray-300"
                      >
                        <Settings2 className="w-3 h-3 mr-1" />
                        {txt('自定义', 'Customize')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1.5/1: 配置编辑 */}
        {showEdit && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {mode === 'create' ? `${txt('配置编辑：', 'Edit Config: ')}${selected?.name}` : txt('配置编辑', 'Edit Config')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{txt('调整 CLI、Agent 配置、MCP 配置和 Skills', 'Adjust CLI, Agent config, MCP config and Skills')}</p>
            </div>

            {/* CLI - 锁定为 OpenCode */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">CLI</div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{txt('运行入口', 'Entry')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium dark:bg-gray-800 dark:text-gray-200">OpenCode</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{txt('(当前仅支持 opencode)', '(currently only opencode is supported)')}</span>
              </div>
            </div>

            {/* 默认模型 */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">{txt('默认模型', 'Default Model')}</div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{txt('创建任务时使用', 'Used when creating tasks')}</span>
              </div>
              <Select value={internalModelId} onValueChange={setInternalModelId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={txt('选择默认模型', 'Select default model')} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {txt('此模型将在创建任务时自动填充，用户可以在任务中覆盖', 'This model will auto-fill when creating tasks and can be overridden')}
              </p>
            </div>

            {/* Agent 配置 - 仅 opencode 显示 */}
            {cli === 'opencode' && (
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden dark:border-gray-800 dark:bg-gray-900">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between dark:border-gray-800">
                <div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">{txt('Agent 配置', 'Agent Config')}</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">oh-my-opencode.jsonc</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-xs text-gray-500 hover:text-amber-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-50 dark:text-gray-400 dark:hover:text-amber-300 dark:hover:bg-amber-500/10 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {txt('重置配置', 'Reset Config')}
                </button>
              </div>
              <div className="h-[450px] overflow-hidden">
                <SwarmConfigForm
                  value={ohMyOpencode}
                  onChange={setOhMyOpencode}
                />
              </div>
            </div>
            )}

            {/* MCP 配置 - 仅 opencode 显示 */}
            {cli === 'opencode' && (
            <JsoncEditor
              label={txt('MCP 配置', 'MCP Config')}
              fileName="opencode.json"
              description={txt('配置 MCP 服务器与集成', 'Configure MCP servers and integrations')}
              value={opencodeConfig}
              onChange={setOpencodeConfig}
              minRows={8}
            />
            )}

            {/* Skills - 仅 opencode 显示 */}
            {cli === 'opencode' && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">Skills</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{txt('支持从 Skills Hub 选择与上传 zip 包', 'Select from Skills Hub or upload zip packages')}</div>
                </div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{totalSkillsCount}{txt(' 项', ' items')}</span>
              </div>
              <div className="border border-gray-100 rounded-lg p-3 space-y-2 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">{txt('从 Skills Hub 选择', 'Select from Skills Hub')}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingInstalledSkills(true)
                      setInstalledSkillsError(null)
                      getSkillsHubStatus()
                        .then((status) => {
                          setInstalledSkills(status.installed_skills)
                        })
                        .catch((error) => {
                          setInstalledSkills([])
                          setInstalledSkillsError(error instanceof Error ? error.message : txt('加载失败', 'Load failed'))
                        })
                        .finally(() => {
                          setIsLoadingInstalledSkills(false)
                        })
                    }}
                    className="text-[11px] text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-300"
                  >
                    {txt('刷新', 'Refresh')}
                  </button>
                </div>
                {isLoadingInstalledSkills ? (
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">{txt('正在加载 Skills Hub...', 'Loading Skills Hub...')}</div>
                ) : null}
                {!isLoadingInstalledSkills && installedSkillsError ? (
                  <div className="text-[11px] text-red-500">{installedSkillsError}</div>
                ) : null}
                {!isLoadingInstalledSkills && !installedSkillsError && installedSkills.length === 0 ? (
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">{txt('Skills Hub 暂无已安装技能', 'No installed skills in Skills Hub')}</div>
                ) : null}
                {!isLoadingInstalledSkills && installedSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {installedSkills.map((skill) => {
                      const selected = skills.includes(skill.name)
                      return (
                        <button
                          key={skill.name}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              handleRemoveSelectedSkill(skill.name)
                            } else {
                              handleAddHubSkill(skill.name)
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
                            selected
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-amber-200 hover:text-amber-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-amber-400 dark:hover:text-amber-300'
                          }`}
                        >
                          {selected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          <span>{skill.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => handleRemoveSelectedSkill(skill)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs text-gray-600 bg-gray-50 hover:text-red-600 hover:border-red-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      <span>{skill}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
              {existingUploads.length > 0 && (
                <div className="space-y-2">
                  {existingUploads.map((file) => (
                    <div
                      key={file}
                      className="flex items-center justify-between text-xs text-gray-600 border border-gray-100 rounded-md px-3 py-2 bg-gray-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{file}</span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">{txt('已上传', 'Uploaded')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingUpload(file)}
                        className="text-[11px] text-gray-400 hover:text-red-500 dark:text-gray-500"
                      >
                        {txt('移除', 'Remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="border border-dashed border-gray-300 rounded-lg p-4 flex items-center justify-between dark:border-gray-700">
                <div>
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">{txt('上传 Skills 包', 'Upload Skills Package')}</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">{txt('仅支持 .zip', 'Only .zip is supported')}</div>
                </div>
                <label className="inline-flex items-center px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-md cursor-pointer hover:border-amber-300 hover:text-amber-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-amber-400 dark:hover:text-amber-300">
                  {txt('选择文件', 'Choose Files')}
                  <input type="file" accept=".zip" multiple className="hidden" onChange={handleUpload} />
                </label>
              </div>
              {uploads.length > 0 && (
                <div className="space-y-2">
                  {uploads.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between text-xs text-gray-600 border border-gray-100 rounded-md px-3 py-2 bg-gray-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{file.name}</span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveUpload(file.name)}
                        className="text-[11px] text-gray-400 hover:text-red-500 dark:text-gray-500"
                      >
                        {txt('移除', 'Remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* CLAUDE.md - 项目规则文档 */}
            {cli === 'opencode' && (
            <MdEditor
              label={txt('项目规则文档', 'Project Rules')}
              fileName="CLAUDE.md"
              description={txt('告诉 Agent 怎么开发这个项目（技术栈、规范、命令等）', 'Tell agents how to develop this project (stack, rules, commands)')}
              value={claudeMd}
              onChange={setClaudeMd}
              minRows={10}
              placeholder={txt(CLAUDE_MD_PLACEHOLDER_ZH, CLAUDE_MD_PLACEHOLDER_EN)}
            />
            )}

            {/* AGENTS.md - Agent 说明（可选）*/}
            {cli === 'opencode' && (
            <MdEditor
              label={txt('Agent 说明', 'Agent Guide')}
              fileName="AGENTS.md"
              description={txt('Agent 说明文档（可选）', 'Agent guide document (optional)')}
              value={agentsMd}
              onChange={setAgentsMd}
              minRows={6}
              placeholder={txt(AGENTS_MD_PLACEHOLDER_ZH, AGENTS_MD_PLACEHOLDER_EN)}
            />
            )}

          </div>
        )}

        {/* 错误提示 */}
        {saveError && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs px-3 py-2">
            {saveError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 px-6 py-4">
        {/* 选择模板 */}
        {mode === 'create' && step === stepMap.select && (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              {txt('取消', 'Cancel')}
            </Button>
          </div>
        )}

        {/* 配置编辑 */}
        {step === stepMap.edit && (
          <div className="flex w-full justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => (mode === 'create' ? setStep(stepMap.select) : onClose())}
              disabled={isSaving}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {mode === 'create' ? txt('返回选择', 'Back to Templates') : txt('取消', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? txt('保存中...', 'Saving...') : txt('保存', 'Save')}
              {!isSaving && <ArrowRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        )}
      </div>
    </div>

    {/* 重置配置确认对话框 */}
    <ConfirmDialog
      open={showResetConfirm}
      title={txt('重置 Agent 配置', 'Reset Agent Config')}
      message={txt('确定要将 Agent 配置重置为默认模板吗？此操作将覆盖当前配置并自动保存。', 'Reset Agent config to default template? This will overwrite current config and auto-save.')}
      confirmText={txt('确认重置', 'Confirm Reset')}
      cancelText={txt('取消', 'Cancel')}
      variant="warning"
      onConfirm={handleResetConfig}
      onCancel={() => setShowResetConfirm(false)}
    />
    </>
  )
}


interface JsoncEditorProps {
  label: string
  fileName: string
  description?: string
  value: string
  onChange: (value: string) => void
  minRows?: number
}

function JsoncEditor({ label, fileName, description, value, onChange, minRows = 8 }: JsoncEditorProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-2 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</div>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{fileName}</span>
      </div>
      {description && <p className="text-[11px] text-gray-500 dark:text-gray-400">{description}</p>}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={minRows}
        className="font-mono text-xs bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      />
    </div>
  )
}

// Markdown 编辑器
interface MdEditorProps {
  label: string
  fileName: string
  description?: string
  value: string
  onChange: (value: string) => void
  minRows?: number
  placeholder?: string
}

function MdEditor({ label, fileName, description, value, onChange, minRows = 8, placeholder }: MdEditorProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-2 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</div>
        </div>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{fileName}</span>
      </div>
      {description && <p className="text-[11px] text-gray-500 dark:text-gray-400">{description}</p>}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={minRows}
        placeholder={placeholder}
        className="font-mono text-xs bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      />
    </div>
  )
}

// Placeholder 文本
const CLAUDE_MD_PLACEHOLDER_ZH = `# 项目名称 - 开发规则

## 技术栈
- Next.js 15 (App Router)
- React 19
- TypeScript 5.9
- Tailwind CSS 3.4

## 目录结构
apps/web/           # Next.js shell（仅路由）
features/           # 功能模块
infra/              # 基础设施

## 代码规范
- 函数组件 + Hooks
- Server Components 优先
- 禁止 as any / @ts-ignore

## 开发命令
pnpm dev:web        # 启动开发服务器
pnpm build          # 生产构建
`

const CLAUDE_MD_PLACEHOLDER_EN = `# Project Name - Development Rules

## Tech Stack
- Next.js 15 (App Router)
- React 19
- TypeScript 5.9
- Tailwind CSS 3.4

## Directory Structure
apps/web/           # Next.js shell (routing only)
features/           # feature modules
infra/              # infrastructure

## Code Standards
- Functional components + Hooks
- Prefer Server Components
- Avoid as any / @ts-ignore

## Dev Commands
pnpm dev:web        # start dev server
pnpm build          # production build
`

const AGENTS_MD_PLACEHOLDER_ZH = `# Agent 说明

## Sisyphus
主代理，负责协调和执行任务。

## Hephaestus
深度架构代理，负责复杂架构设计。

## Explore
探索代理，负责代码库搜索和分析。
`

const AGENTS_MD_PLACEHOLDER_EN = `# Agent Guide

## Sisyphus
Primary agent for coordination and execution.

## Hephaestus
Architecture-focused agent for complex designs.

## Explore
Exploration agent for codebase search and analysis.
`

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 解析 JSONC
function parseJSONC(str: string): OpencodeConfig | null {
  try {
    const cleanStr = stripComments(str)
    return parse(cleanStr)
  } catch (e) {
    console.error('Failed to parse JSONC:', e)
    return null
  }
}

// 嵌入式表单组件 - 包装 EmbeddedConfigEditor 并提供 FormProvider
interface SwarmConfigFormProps {
  value: string
  onChange: (value: string) => void
}

function SwarmConfigForm({ value, onChange }: SwarmConfigFormProps) {
  // 解析初始配置
  const initialConfig = useMemo(() => {
    if (value && value.trim() !== '') {
      const parsed = parseJSONC(value)
      if (parsed) return parsed
    }
    return defaultMockConfig
  }, [value])

  const methods = useForm<OpencodeConfig>({
    resolver: zodResolver(opencodeConfigSchema),
    defaultValues: initialConfig,
    mode: 'onChange',
  })
  const discovery = useExecutorDiscovery('OPENCODE')

  useEffect(() => {
    methods.reset(initialConfig)
  }, [value, initialConfig, methods])

  // 防抖同步表单变化到父组件
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const subscription = methods.watch((formData) => {
      // 清除之前的定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      // 防抖 300ms
      timeoutRef.current = setTimeout(() => {
        // 过滤掉 undefined 值，保持对象整洁
        const cleanedData = JSON.parse(JSON.stringify(formData, (_, v) => v ?? undefined))
        onChange(JSON.stringify(cleanedData, null, 2))
      }, 300)
    })
    return () => {
      subscription.unsubscribe()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [methods, onChange])

  return (
    <FormProvider {...methods}>
      <EmbeddedConfigEditor
        defaultSection="agents-primary"
        modelSelectorConfig={discovery.modelSelector}
        isLoadingModels={discovery.loadingModels}
        onRefreshModels={discovery.refreshModels}
        isRefreshingModels={discovery.isRefreshing}
      />
    </FormProvider>
  )
}
