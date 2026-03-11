'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
// @ts-expect-error TypeScript module resolution issue with next/navigation in monorepo
import { useRouter } from 'next/navigation'
import { FormProvider as RHFFormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { parse, stripComments } from 'jsonc-parser'

import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
  Textarea,
  Button,
  Switch,
  EmbeddedConfigEditor,
  defaultMockConfig,
  opencodeConfigSchema,
  type OpencodeConfig,
} from '@shared/ui'
import { ArrowLeft, Hexagon } from 'lucide-react'
import { LocalRepoPickerButton } from './LocalRepoPickerButton'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { useProjectBranches } from '@/features/agent-execution/hooks/useProjectBranches'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'
import { getSkillsHubStatus } from '@/features/settings/lib/skills-api'

// 动态加载的蜂群类型
interface SwarmOption {
  id: string
  sourceType?: string
  name: string
  description: string | null
  agents: string[]
  skillsCount: number
  accent: string
  ohMyOpencodeJson?: string | null
  opencodeJson?: string | null
  claudeMd?: string | null
  agentsMd?: string | null
  includeTemplate: boolean
  templateGitUrl?: string | null
  templateBranch?: string | null
  initPlan?: {
    files: string[]
    directories: string[]
    skillEntries: string[]
    templateSource: {
      includeTemplate: boolean
      templateGitUrl?: string | null
      templateBranch?: string | null
      cloneSupported: boolean
    }
  }
}

function getSkillDisplayName(entry: string): string {
  const normalized = entry.trim().replaceAll('\\', '/')
  if (!normalized) return entry

  const fromOpencode = normalized.match(/(?:^|\/)\.opencode\/skills\/([^/]+)(?:\/|$)/)
  if (fromOpencode?.[1]) return fromOpencode[1]

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return normalized
  if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === 'skill.md') {
    return parts[parts.length - 2]
  }
  return parts[parts.length - 1]
}

export interface CreateProjectFormValues {
  name: string
  description?: string
  swarmId: string
  swarmName?: string
  repoPath: string
  targetBranch: string
}

interface CapabilityDraft {
  agentConfig: boolean
  skills: boolean
  rules: boolean
  template: boolean
  ohMyOpencodeJson: string
  opencodeJson: string
  claudeMd: string
  agentsMd: string
  includeTemplate: boolean
  templateGitUrl: string
  templateBranch: string
}

interface CreateProjectResponsePayload {
  id: string
  configWrite?: {
    skillsSync?: {
      missingSkills?: string[]
    }
  }
}

interface CreateProjectPageProps {
  onCreate?: (data: CreateProjectFormValues) => void
  texts?: {
    nameRequired: string
    repoRequired: string
    swarmRequired: string
    createFailed: string
    createFailedCheckConsole: string
    back: string
    title: string
    projectName: string
    projectNamePlaceholder: string
    projectDescription: string
    projectDescriptionPlaceholder: string
    gitRepo: string
    gitRepoPlaceholder: string
    repoHint: string
    defaultSwarm: string
    availableSwarms: string
    swarmCapabilities: string
    capabilityHint: string
    capabilityAgentConfig: string
    capabilitySkills: string
    capabilityRules: string
    capabilityTemplate: string
    capabilityTemplateSwitch: string
    capabilityTemplateRepo: string
    capabilityTemplateBranch: string
    capabilityTemplateRepoPlaceholder: string
    capabilityTemplateBranchPlaceholder: string
    capabilityAgentConfigOhMy: string
    capabilityAgentConfigOpencode: string
    capabilityRulesClaude: string
    capabilityRulesAgents: string
    effectivePlanTitle: string
    effectivePlanHint: string
    effectivePlanWillWriteFiles: string
    effectivePlanWillCreateDirs: string
    effectivePlanWillSyncSkills: string
    effectivePlanTemplateSource: string
    effectivePlanDisabled: string
    effectivePlanNone: string
    effectivePlanMoreItems: string
    effectivePlanTemplateUnsupported: string
    skillsHubCheckFailed: string
    missingSkillsTitle: string
    missingSkillsHint: string
    missingSkillsGoSettings: string
    missingSkillsBeforeCreate: string
    missingSkillsAndMore: string
    skillsHubChecking: string
    skillsHubReadyPrefix: string
    skillsSyncMissingAfterCreate: string
    addSkills: string
    refreshHubSkills: string
    templateSkillsCountLabel: string
    projectSkillsCountLabel: string
    hubSkillsCountLabel: string
    selectedProjectSkillsTitle: string
    noSelectedProjectSkills: string
    noHubSkills: string
    addSelectedFromHub: string
    noHubSkillsSelected: string
    templateSkillTag: string
    loadingSwarms: string
    swarmGroupOfficial: string
    swarmGroupCustom: string
    selectSwarmPlaceholder: string
    swarmNotFound: string
    swarmNoDescription: string
    noSwarms: string
    targetBranch: string
    targetBranchRequired: string
    loadingBranches: string
    selectBranchPlaceholder: string
    cancel: string
    createProject: string
  }
}

export { CreateProjectPage }

const DEFAULT_OPENCODE_CONFIG_TEXT = '{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {}\n}'
const LAST_SELECTED_SWARM_STORAGE_KEY = 'bee:last-selected-swarm-id'

const CreateProjectPage: React.FC<CreateProjectPageProps> = ({ onCreate, texts = {
  nameRequired: '项目名称是必填项。',
  repoRequired: '请输入 Git 仓库地址或选择本地仓库。',
  swarmRequired: '请选择一个蜂群。',
  createFailed: '创建项目失败',
  createFailedCheckConsole: '创建项目失败，请检查控制台',
  back: '返回',
  title: '创建新项目',
  projectName: '项目名称',
  projectNamePlaceholder: '请输入项目名称',
  projectDescription: '项目描述',
  projectDescriptionPlaceholder: '关于该项目的简要说明...',
  gitRepo: 'Git 仓库',
  gitRepoPlaceholder: 'https://github.com/user/repo.git 或本地路径 /path/to/repo',
  repoHint: '输入 Git URL 或点击上方按钮选择本地仓库',
  defaultSwarm: '选择蜂群',
  availableSwarms: '可选蜂群',
  swarmCapabilities: '蜂群能力应用',
  capabilityHint: '默认应用蜂群全部能力，可按需裁剪后创建项目。',
  capabilityAgentConfig: 'Agent 配置',
  capabilitySkills: 'Skills',
  capabilityRules: '规则文档',
  capabilityTemplate: '项目模板',
  capabilityTemplateSwitch: '创建时拉取模板',
  capabilityTemplateRepo: '模板仓库',
  capabilityTemplateBranch: '模板分支',
  capabilityTemplateRepoPlaceholder: 'https://github.com/xxx/template.git',
  capabilityTemplateBranchPlaceholder: 'master',
  capabilityAgentConfigOhMy: 'oh-my-opencode 配置',
  capabilityAgentConfigOpencode: 'opencode 配置',
  capabilityRulesClaude: 'CLAUDE.md 内容',
  capabilityRulesAgents: 'AGENTS.md 内容',
  effectivePlanTitle: '本次生效清单',
  effectivePlanHint: '根据当前开关与编辑内容，创建项目时将按如下计划写入。',
  effectivePlanWillWriteFiles: '将写入文件',
  effectivePlanWillCreateDirs: '将创建目录',
  effectivePlanWillSyncSkills: '将同步 Skills',
  effectivePlanTemplateSource: '模板来源',
  effectivePlanDisabled: '未启用',
  effectivePlanNone: '无',
  effectivePlanMoreItems: '更多项',
  effectivePlanTemplateUnsupported: '模板仓库拉取暂未实现，当前仅展示来源信息。',
    skillsHubCheckFailed: 'Skills Hub 状态检查失败，可能无法识别缺失 Skills。',
    missingSkillsTitle: '以下 Skills 尚未安装到本机',
    missingSkillsHint: '请先前往设置页安装，避免创建项目后无法同步到 .opencode/skills。',
    missingSkillsGoSettings: '前往设置',
    missingSkillsBeforeCreate: '请先安装缺失 Skills 后再创建项目',
    missingSkillsAndMore: '等更多项',
    skillsHubChecking: '正在检查 Skills Hub...',
    skillsHubReadyPrefix: '已安装 Skills：',
    skillsSyncMissingAfterCreate: '项目已创建，但以下 Skills 未同步到项目',
    addSkills: '添加 Skills',
    refreshHubSkills: '刷新 Hub',
    templateSkillsCountLabel: '模板 Skills',
    projectSkillsCountLabel: '当前项目 Skills',
    hubSkillsCountLabel: 'Skills Hub Skills',
    selectedProjectSkillsTitle: '项目将同步 Skills',
    noSelectedProjectSkills: '暂无项目 Skills',
    noHubSkills: 'Skills Hub 暂无已安装技能',
    addSelectedFromHub: '添加已选 Skills',
    noHubSkillsSelected: '请先选择至少一个 Hub Skill',
    templateSkillTag: '模板',
  loadingSwarms: '加载蜂群...',
  swarmGroupOfficial: '官方蜂群',
  swarmGroupCustom: '自定义蜂群',
  selectSwarmPlaceholder: '选择蜂群，输入 / 查看所有可用蜂群...',
  swarmNotFound: '未找到匹配的蜂群',
  swarmNoDescription: '暂无描述',
  noSwarms: '暂无可用蜂群，请先创建蜂群',
  targetBranch: '默认目标分支',
  targetBranchRequired: '请选择默认目标分支。',
  loadingBranches: '加载分支...',
  selectBranchPlaceholder: '请输入或选择默认分支',
  cancel: '取消',
  createProject: '创建项目',
} }) => {
  const router = useRouter()

  const formSchema = z.object({
    name: z.string().min(1, { message: texts.nameRequired }),
    description: z.string().optional(),
    repoPath: z.string().min(1, { message: texts.repoRequired }),
    swarmId: z.string().min(1, { message: texts.swarmRequired }),
    swarmName: z.string().optional(),
    targetBranch: z.string().min(1, { message: texts.targetBranchRequired }),
  })
  
  const form = useForm<CreateProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      repoPath: '',
      swarmId: '',
      swarmName: '',
      targetBranch: '',
    },
  })

  // 蜂群选择状态
  const [swarms, setSwarms] = useState<SwarmOption[]>([])
  const [isLoadingSwarms, setIsLoadingSwarms] = useState(false)
  const [selectedSwarm, setSelectedSwarm] = useState<SwarmOption | null>(null)
  const [installedSkills, setInstalledSkills] = useState<string[]>([])
  const [isCheckingSkillsHub, setIsCheckingSkillsHub] = useState(false)
  const [skillsHubCheckFailed, setSkillsHubCheckFailed] = useState(false)
  const [showAddSkillsPanel, setShowAddSkillsPanel] = useState(false)
  const [projectSkillEntries, setProjectSkillEntries] = useState<string[]>([])
  const [selectedHubSkills, setSelectedHubSkills] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityDraft>({
    agentConfig: true,
    skills: true,
    rules: true,
    template: true,
    ohMyOpencodeJson: '',
    opencodeJson: '',
    claudeMd: '',
    agentsMd: '',
    includeTemplate: false,
    templateGitUrl: '',
    templateBranch: 'master',
  })
  const repoPathValue = form.watch('repoPath')
  const targetBranchValue = form.watch('targetBranch')
  const { branches, isLoading: isLoadingBranches } = useProjectBranches({ repoPath: repoPathValue })
  const availableBranches = useMemo(
    () => {
      const branchMap = new Map<string, typeof branches[number]>()
      branches.forEach((branch) => {
        const existing = branchMap.get(branch.name)
        if (!existing) {
          branchMap.set(branch.name, branch)
          return
        }
        if (existing.is_remote && !branch.is_remote) {
          branchMap.set(branch.name, branch)
          return
        }
        if (!existing.is_current && branch.is_current) {
          branchMap.set(branch.name, branch)
        }
      })
      return Array.from(branchMap.values()).sort((a, b) => {
        if (a.is_current && !b.is_current) return -1
        if (!a.is_current && b.is_current) return 1
        if (!a.is_remote && b.is_remote) return -1
        if (a.is_remote && !b.is_remote) return 1
        return a.name.localeCompare(b.name)
      })
    },
    [branches]
  )

  // 加载蜂群列表
  useEffect(() => {
    setIsLoadingSwarms(true)
    fetch(resolveHttpUrl('/api/swarms'))
      .then((res) => res.json())
      .then((data: SwarmOption[]) => {
        setSwarms(data)
        if (data.length > 0 && !selectedSwarm) {
          const lastSelectedSwarmId = typeof window !== 'undefined'
            ? window.localStorage.getItem(LAST_SELECTED_SWARM_STORAGE_KEY)
            : null
          const defaultSwarm = data.find((item) => item.id === lastSelectedSwarmId)
            ?? data.find((item) => item.sourceType === 'official')
            ?? data[0]
          handleSelectSwarm(defaultSwarm)
        }
      })
      .catch((err) => {
        console.error('Failed to load swarms:', err)
      })
      .finally(() => {
        setIsLoadingSwarms(false)
      })
  }, [])

  useEffect(() => {
    if (availableBranches.length === 0) return
    if (targetBranchValue) return
    const currentBranch = availableBranches.find((branch) => branch.is_current)
    form.setValue('targetBranch', currentBranch?.name || availableBranches[0].name, {
      shouldValidate: true,
    })
  }, [availableBranches, form, targetBranchValue])

  // 获取蜂群的 accent 颜色
  const getAccentColor = (accent: string) => {
    const colors: Record<string, string> = {
      amber: 'bg-amber-100 text-amber-700 border-amber-200',
      violet: 'bg-violet-100 text-violet-700 border-violet-200',
      teal: 'bg-teal-100 text-teal-700 border-teal-200',
      rose: 'bg-rose-100 text-rose-700 border-rose-200',
      blue: 'bg-blue-100 text-blue-700 border-blue-200',
    }
    return colors[accent] || colors.amber
  }

  // 选择蜂群
  const handleSelectSwarm = (swarm: SwarmOption) => {
    const baseSkills = (swarm.initPlan?.skillEntries || []).map(getSkillDisplayName)
    setSelectedSwarm(swarm)
    setProjectSkillEntries(baseSkills)
    setSelectedHubSkills([])
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_SELECTED_SWARM_STORAGE_KEY, swarm.id)
    }
    form.setValue('swarmId', swarm.id, { shouldValidate: true })
    form.setValue('swarmName', swarm.name, { shouldValidate: true })
    setCapabilityDraft({
      agentConfig: true,
      skills: true,
      rules: true,
      template: true,
      ohMyOpencodeJson: swarm.ohMyOpencodeJson || '',
      opencodeJson: swarm.opencodeJson || DEFAULT_OPENCODE_CONFIG_TEXT,
      claudeMd: swarm.claudeMd || '',
      agentsMd: swarm.agentsMd || '',
      includeTemplate: swarm.includeTemplate || false,
      templateGitUrl: swarm.templateGitUrl || '',
      templateBranch: swarm.templateBranch || 'master',
    })
  }

  // 移除已选蜂群
  const officialSwarms = swarms.filter((swarm) => swarm.sourceType === 'official')
  const customSwarms = swarms.filter((swarm) => swarm.sourceType !== 'official')

  const effectiveFiles = useMemo(() => {
    if (!selectedSwarm) return []
    const files: string[] = []
    if (capabilityDraft.agentConfig) {
      if (capabilityDraft.ohMyOpencodeJson.trim()) files.push('.opencode/oh-my-opencode.jsonc')
      if (capabilityDraft.opencodeJson.trim()) files.push('opencode.json')
    }
    if (capabilityDraft.rules) {
      if (capabilityDraft.claudeMd.trim()) files.push('CLAUDE.md')
      if (capabilityDraft.agentsMd.trim()) files.push('AGENTS.md')
    }
    return files
  }, [selectedSwarm, capabilityDraft])

  const effectiveDirectories = useMemo(() => {
    if (!selectedSwarm) return []
    const allDirectories = selectedSwarm.initPlan?.directories || []
    const skillDirectories = allDirectories.filter((dir) =>
      dir.trim().replaceAll('\\', '/').startsWith('.opencode/skills')
    )
    const templateDirectories = allDirectories.filter((dir) =>
      !dir.trim().replaceAll('\\', '/').startsWith('.opencode/skills')
    )
    const result: string[] = []
    if (capabilityDraft.skills) {
      result.push(...skillDirectories)
    }
    if (capabilityDraft.template && capabilityDraft.includeTemplate) {
      result.push(...templateDirectories)
    }
    return result
  }, [selectedSwarm, capabilityDraft.skills, capabilityDraft.template, capabilityDraft.includeTemplate])

  const templateSkillEntries = useMemo(() => {
    if (!selectedSwarm || !capabilityDraft.skills) return []
    const entries = selectedSwarm.initPlan?.skillEntries || []
    return entries.map(getSkillDisplayName)
  }, [selectedSwarm, capabilityDraft.skills])

  const effectiveSkillEntries = useMemo(() => {
    if (!capabilityDraft.skills) return []
    return projectSkillEntries
  }, [capabilityDraft.skills, projectSkillEntries])

  const effectiveTemplateSource = useMemo(() => {
    if (!selectedSwarm || !capabilityDraft.template || !capabilityDraft.includeTemplate) {
      return null
    }
    const source = selectedSwarm.initPlan?.templateSource
    const gitUrl = capabilityDraft.templateGitUrl.trim() || source?.templateGitUrl || ''
    const branch = capabilityDraft.templateBranch.trim() || source?.templateBranch || 'master'
    return {
      gitUrl,
      branch,
      cloneSupported: source?.cloneSupported ?? false,
    }
  }, [selectedSwarm, capabilityDraft])

  const effectiveSkillPreview = effectiveSkillEntries.slice(0, 6)
  const remainingEffectiveSkillCount = Math.max(effectiveSkillEntries.length - effectiveSkillPreview.length, 0)
  const installedSkillSet = useMemo(() => new Set(installedSkills), [installedSkills])
  const missingSkillEntries = useMemo(
    () => effectiveSkillEntries.filter((skill) => !installedSkillSet.has(skill)),
    [effectiveSkillEntries, installedSkillSet]
  )
  const missingSkillPreview = missingSkillEntries.slice(0, 6)
  const remainingMissingSkillCount = Math.max(missingSkillEntries.length - missingSkillPreview.length, 0)
  const refreshSkillsHubStatus = async () => {
    setIsCheckingSkillsHub(true)
    try {
      const status = await getSkillsHubStatus()
      setInstalledSkills(
        status.installed_skills
          .map((skill) => skill.name.trim())
          .filter((name) => name.length > 0)
      )
      setSkillsHubCheckFailed(false)
    } catch {
      setInstalledSkills([])
      setSkillsHubCheckFailed(true)
    } finally {
      setIsCheckingSkillsHub(false)
    }
  }

  useEffect(() => {
    void refreshSkillsHubStatus()
  }, [])

  useEffect(() => {
    setProjectSkillEntries((prev) => {
      const next = [...new Set([...templateSkillEntries, ...prev])]
      return next
    })
  }, [templateSkillEntries])

  const toggleHubSkillSelection = (skill: string) => {
    setSelectedHubSkills((prev) => {
      if (prev.includes(skill)) {
        return prev.filter((item) => item !== skill)
      }
      return [...prev, skill]
    })
  }

  const handleAddSelectedFromHub = () => {
    if (selectedHubSkills.length === 0) {
      alert(texts.noHubSkillsSelected)
      return
    }
    setProjectSkillEntries((prev) => [...new Set([...prev, ...selectedHubSkills])])
    setSelectedHubSkills([])
    setShowAddSkillsPanel(false)
  }

  const handleRemoveProjectSkill = (skill: string) => {
    if (templateSkillEntries.includes(skill)) {
      return
    }
    setProjectSkillEntries((prev) => prev.filter((item) => item !== skill))
  }

  const onSubmit = async (values: CreateProjectFormValues) => {
    setSubmitError(null)
    if (capabilityDraft.skills && missingSkillEntries.length > 0) {
      const preview = missingSkillPreview.join(', ')
      const more = remainingMissingSkillCount > 0 ? ` +${remainingMissingSkillCount}` : ''
      setSubmitError(`${texts.missingSkillsBeforeCreate}: ${preview}${more}`)
      return
    }
    setIsSubmitting(true)
    // 转换字段名: camelCase -> snake_case (后端期望)
    const payload = {
      name: values.name,
      description: values.description,
      repo_path: values.repoPath,
      swarm_id: values.swarmId,
      target_branch: values.targetBranch,
      capability_scope: {
        agent_config: capabilityDraft.agentConfig,
        skills: capabilityDraft.skills,
        rules: capabilityDraft.rules,
        template: capabilityDraft.template,
      },
      capability_overrides: {
        oh_my_opencode_json: capabilityDraft.ohMyOpencodeJson || undefined,
        opencode_json: capabilityDraft.opencodeJson || undefined,
        claude_md: capabilityDraft.claudeMd || undefined,
        agents_md: capabilityDraft.agentsMd || undefined,
        project_skills: capabilityDraft.skills ? projectSkillEntries : [],
        include_template: capabilityDraft.includeTemplate,
        template_git_url: capabilityDraft.templateGitUrl || undefined,
        template_branch: capabilityDraft.templateBranch || undefined,
      },
    }

    try {
      const response = await fetch(resolveHttpUrl('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // 尝试获取错误详情
        let errorMsg = texts.createFailed
        try {
          const errData = await response.json()
          errorMsg = errData.message || errData.error || errorMsg
        } catch {
          const errText = await response.text()
          if (errText) errorMsg = errText
        }
        console.error('Failed to create project:', errorMsg)
        setSubmitError(errorMsg)
        setIsSubmitting(false)
        return
      }

      const project = await response.json() as CreateProjectResponsePayload
      const backendMissingSkills = project.configWrite?.skillsSync?.missingSkills || []
      if (backendMissingSkills.length > 0) {
        setSubmitError(`${texts.skillsSyncMissingAfterCreate}: ${backendMissingSkills.join(', ')}`)
        setIsSubmitting(false)
        return
      }
      router.push(`/projects/${project.id}/board`)
    } catch (error) {
      console.error('Failed to create project:', error)
      setSubmitError(texts.createFailedCheckConsole)
      setIsSubmitting(false)
    }
  }


  const handleGoBack = () => {
    router.back()
  }

  return (
    <div className="h-full min-h-0 bg-[#f8f7f5] dark:bg-[#1c1917]">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {texts.back}
            </Button>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {texts.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <RHFFormProvider {...form}>
          <Form>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 bg-white dark:bg-gray-900 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
              <FormField name="name">
                {({ field }) => (
                  <div className="space-y-2">
                    <FormLabel className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {texts.projectName} <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <input
                        placeholder={texts.projectNamePlaceholder}
                        className={`w-full h-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                          form.formState.errors.name ? 'border-red-300' : ''
                        }`}
                        name={field.name}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        value={(field.value as string) ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <FormField name="description">
                {({ field }) => (
                  <div className="space-y-2">
                    <FormLabel className="block text-sm font-medium text-gray-700 dark:text-gray-300">{texts.projectDescription}</FormLabel>
                    <FormControl>
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all bg-white dark:bg-gray-800">
                        <Textarea
                          placeholder={texts.projectDescriptionPlaceholder}
                          rows={3}
                          className="w-full border-none focus:ring-0 p-4 text-sm placeholder-gray-400 resize-none bg-transparent"
                          name={field.name}
                          onChange={(event) => form.setValue('description', event.target.value, { shouldValidate: true })}
                          onBlur={() => form.trigger('description')}
                          value={(field.value as string) ?? ''}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <FormField name="repoPath">
                {({ field }) => (
                  <div className="space-y-2">
                    <FormLabel className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {texts.gitRepo} <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {/* 输入框 + 选择按钮 */}
                        <div className="flex flex-col gap-2">
                          <input
                            placeholder={texts.gitRepoPlaceholder}
                            className={`flex-1 h-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                              form.formState.errors.repoPath ? 'border-red-300' : ''
                            }`}
                            name={field.name}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            value={(field.value as string) ?? ''}
                          />
                          <LocalRepoPickerButton
                            selectedPath={(field.value as string) ?? ''}
                            onSelect={(path: string) => {
                              form.setValue('repoPath', path, { shouldValidate: true })
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">
                          {texts.repoHint}
                        </p>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <FormField name="targetBranch">
                {({ field }) => (
                  <div className="space-y-2">
                    <FormLabel className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {texts.targetBranch} <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      {availableBranches.length > 0 ? (
                        <select
                          className={`w-full h-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                            form.formState.errors.targetBranch ? 'border-red-300' : ''
                          }`}
                          name={field.name}
                          onChange={(event) => form.setValue('targetBranch', event.target.value, { shouldValidate: true })}
                          onBlur={() => form.trigger('targetBranch')}
                          value={(field.value as string) ?? ''}
                        >
                          {availableBranches.map((branch) => (
                            <option key={branch.name} value={branch.name}>
                              {branch.is_remote ? `${branch.name}（远程）` : branch.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          placeholder={isLoadingBranches ? texts.loadingBranches : texts.selectBranchPlaceholder}
                          className={`w-full h-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                            form.formState.errors.targetBranch ? 'border-red-300' : ''
                          }`}
                          name={field.name}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          value={(field.value as string) ?? ''}
                          disabled={isLoadingBranches}
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {texts.defaultSwarm} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {texts.availableSwarms}：{swarms.length}
                </p>

                {isLoadingSwarms ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                    {texts.loadingSwarms}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {officialSwarms.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {texts.swarmGroupOfficial}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {officialSwarms.map((swarm) => {
                            const isActive = selectedSwarm?.id === swarm.id
                            return (
                              <button
                                key={swarm.id}
                                type="button"
                                onClick={() => handleSelectSwarm(swarm)}
                                className={`rounded-lg border p-4 text-left transition-colors ${
                                  isActive
                                    ? 'border-amber-400 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-500/10'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300 dark:hover:border-amber-600'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${getAccentColor(swarm.accent)}`}>
                                    <Hexagon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{swarm.name}</p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                      {swarm.description || texts.swarmNoDescription}
                                    </p>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                      {swarm.agents.length} Agents · {swarm.skillsCount} Skills
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {customSwarms.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {texts.swarmGroupCustom}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {customSwarms.map((swarm) => {
                            const isActive = selectedSwarm?.id === swarm.id
                            return (
                              <button
                                key={swarm.id}
                                type="button"
                                onClick={() => handleSelectSwarm(swarm)}
                                className={`rounded-lg border p-4 text-left transition-colors ${
                                  isActive
                                    ? 'border-amber-400 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-500/10'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300 dark:hover:border-amber-600'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${getAccentColor(swarm.accent)}`}>
                                    <Hexagon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{swarm.name}</p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                      {swarm.description || texts.swarmNoDescription}
                                    </p>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                      {swarm.agents.length} Agents · {swarm.skillsCount} Skills
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {swarms.length === 0 && !isLoadingSwarms ? (
                  <p className="text-sm text-amber-600">{texts.noSwarms}</p>
                ) : null}
                {form.formState.errors.swarmId ? (
                  <p className="text-sm text-red-500">{form.formState.errors.swarmId.message}</p>
                ) : null}
              </div>

              {selectedSwarm && (
                <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/70 dark:bg-gray-800/40">
                  <div>
                    <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">{texts.swarmCapabilities}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{texts.capabilityHint}</p>
                  </div>

                  <div className="space-y-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-200">{texts.capabilityAgentConfig}</span>
                      <Switch
                        checked={capabilityDraft.agentConfig}
                        onCheckedChange={(checked) =>
                          setCapabilityDraft((prev) => ({ ...prev, agentConfig: checked }))
                        }
                      />
                    </label>
                    {capabilityDraft.agentConfig && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-600 dark:text-gray-300">{texts.capabilityAgentConfigOhMy}</label>
                          <div className="h-[420px] overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                            <SwarmConfigForm
                              value={capabilityDraft.ohMyOpencodeJson}
                              onChange={(value) =>
                                setCapabilityDraft((prev) => ({ ...prev, ohMyOpencodeJson: value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-600 dark:text-gray-300">{texts.capabilityAgentConfigOpencode}</label>
                          <Textarea
                            value={capabilityDraft.opencodeJson}
                            onChange={(event) =>
                              setCapabilityDraft((prev) => ({ ...prev, opencodeJson: event.target.value }))
                            }
                            rows={5}
                            className="bg-white dark:bg-gray-900 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-200">{texts.capabilitySkills}</span>
                      <Switch
                        checked={capabilityDraft.skills}
                        onCheckedChange={(checked) =>
                          setCapabilityDraft((prev) => ({ ...prev, skills: checked }))
                        }
                      />
                    </label>
                    {capabilityDraft.skills && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {texts.templateSkillsCountLabel}：{templateSkillEntries.length}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {texts.projectSkillsCountLabel}：{effectiveSkillEntries.length}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {isCheckingSkillsHub
                                ? texts.skillsHubChecking
                                : `${texts.hubSkillsCountLabel}：${installedSkills.length}`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={refreshSkillsHubStatus}
                            className="h-7 text-xs"
                          >
                            {texts.refreshHubSkills}
                          </Button>
                        </div>
                        {skillsHubCheckFailed ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400">{texts.skillsHubCheckFailed}</p>
                        ) : null}
                        <div className="rounded-md border border-gray-200 bg-gray-50/80 p-2 text-xs dark:border-gray-700 dark:bg-gray-800/40">
                          <p className="font-medium text-gray-700 dark:text-gray-200">{texts.selectedProjectSkillsTitle}</p>
                          {effectiveSkillEntries.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {effectiveSkillEntries.map((skill) => {
                                const available = installedSkillSet.has(skill)
                                const isTemplateSkill = templateSkillEntries.includes(skill)
                                return (
                                  <button
                                    key={skill}
                                    type="button"
                                    onClick={() => handleRemoveProjectSkill(skill)}
                                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                                      available
                                        ? 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'
                                        : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
                                    }`}
                                    title={isTemplateSkill ? texts.templateSkillTag : undefined}
                                  >
                                    <span>{skill}</span>
                                    {isTemplateSkill ? (
                                      <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                        {texts.templateSkillTag}
                                      </span>
                                    ) : null}
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="mt-1 text-gray-500 dark:text-gray-400">{texts.noSelectedProjectSkills}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddSkillsPanel((prev) => !prev)}
                            className="h-7 text-xs"
                          >
                            {texts.addSkills}
                          </Button>
                        </div>
                        {missingSkillEntries.length > 0 ? (
                          <div className="rounded-md border border-amber-300 bg-amber-50/80 p-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <p className="font-medium">{texts.missingSkillsTitle}</p>
                            <p className="mt-1 break-words">
                              {missingSkillPreview.join(', ')}
                              {remainingMissingSkillCount > 0 ? ` +${remainingMissingSkillCount} ${texts.missingSkillsAndMore}` : ''}
                            </p>
                            <p className="mt-1">{texts.missingSkillsHint}</p>
                            <div className="mt-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => router.push('/settings?tab=skills')}
                                  className="h-7 text-xs"
                                >
                                  {texts.missingSkillsGoSettings}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {showAddSkillsPanel ? (
                          <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3 text-xs dark:border-gray-700 dark:bg-gray-800/40">
                            {installedSkills.length > 0 ? (
                              <div className="space-y-1.5">
                                <div className="flex flex-wrap gap-2">
                                  {installedSkills.map((skill) => {
                                    const selected = selectedHubSkills.includes(skill)
                                    return (
                                      <button
                                        key={skill}
                                        type="button"
                                        onClick={() => toggleHubSkillSelection(skill)}
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                                          selected
                                            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                            : 'border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'
                                        }`}
                                      >
                                        {skill}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : (
                              <p className="text-gray-500 dark:text-gray-400">{texts.noHubSkills}</p>
                            )}
                            <div className="mt-3">
                              <Button
                                type="button"
                                size="sm"
                                onClick={handleAddSelectedFromHub}
                                disabled={selectedHubSkills.length === 0}
                                className="h-8 text-xs"
                              >
                                {texts.addSelectedFromHub}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-200">{texts.capabilityRules}</span>
                      <Switch
                        checked={capabilityDraft.rules}
                        onCheckedChange={(checked) =>
                          setCapabilityDraft((prev) => ({ ...prev, rules: checked }))
                        }
                      />
                    </label>
                    {capabilityDraft.rules && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-600 dark:text-gray-300">{texts.capabilityRulesClaude}</label>
                          <Textarea
                            value={capabilityDraft.claudeMd}
                            onChange={(event) =>
                              setCapabilityDraft((prev) => ({ ...prev, claudeMd: event.target.value }))
                            }
                            rows={4}
                            className="bg-white dark:bg-gray-900 text-xs"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-600 dark:text-gray-300">{texts.capabilityRulesAgents}</label>
                          <Textarea
                            value={capabilityDraft.agentsMd}
                            onChange={(event) =>
                              setCapabilityDraft((prev) => ({ ...prev, agentsMd: event.target.value }))
                            }
                            rows={4}
                            className="bg-white dark:bg-gray-900 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-200">{texts.capabilityTemplate}</span>
                      <Switch
                        checked={capabilityDraft.template}
                        onCheckedChange={(checked) =>
                          setCapabilityDraft((prev) => ({ ...prev, template: checked }))
                        }
                      />
                    </label>
                    {capabilityDraft.template && (
                      <div className="space-y-3">
                        <label className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                          <span className="text-sm text-gray-700 dark:text-gray-200">{texts.capabilityTemplateSwitch}</span>
                          <Switch
                            checked={capabilityDraft.includeTemplate}
                            onCheckedChange={(checked) =>
                              setCapabilityDraft((prev) => ({ ...prev, includeTemplate: checked }))
                            }
                          />
                        </label>
                        {capabilityDraft.includeTemplate && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="block text-xs text-gray-600 dark:text-gray-300">{texts.capabilityTemplateRepo}</label>
                              <input
                                className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
                                value={capabilityDraft.templateGitUrl}
                                onChange={(event) =>
                                  setCapabilityDraft((prev) => ({ ...prev, templateGitUrl: event.target.value }))
                                }
                                placeholder={texts.capabilityTemplateRepoPlaceholder}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-xs text-gray-600 dark:text-gray-300">{texts.capabilityTemplateBranch}</label>
                              <input
                                className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
                                value={capabilityDraft.templateBranch}
                                onChange={(event) =>
                                  setCapabilityDraft((prev) => ({ ...prev, templateBranch: event.target.value }))
                                }
                                placeholder={texts.capabilityTemplateBranchPlaceholder}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{texts.effectivePlanTitle}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{texts.effectivePlanHint}</p>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
                      <p>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{texts.effectivePlanWillWriteFiles}:</span>{' '}
                        {effectiveFiles.length > 0 ? effectiveFiles.join(', ') : texts.effectivePlanNone}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{texts.effectivePlanWillCreateDirs}:</span>{' '}
                        {effectiveDirectories.length > 0 ? effectiveDirectories.join(', ') : texts.effectivePlanNone}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{texts.effectivePlanWillSyncSkills}:</span>{' '}
                        {effectiveSkillPreview.length > 0 ? effectiveSkillPreview.join(', ') : texts.effectivePlanNone}
                        {remainingEffectiveSkillCount > 0 ? ` +${remainingEffectiveSkillCount} ${texts.effectivePlanMoreItems}` : ''}
                      </p>
                      <p className="break-all">
                        <span className="font-medium text-gray-700 dark:text-gray-200">{texts.effectivePlanTemplateSource}:</span>{' '}
                        {effectiveTemplateSource?.gitUrl ? `${effectiveTemplateSource.gitUrl} (${effectiveTemplateSource.branch})` : texts.effectivePlanDisabled}
                      </p>
                      {effectiveTemplateSource && !effectiveTemplateSource.cloneSupported ? (
                        <p className="text-amber-600 dark:text-amber-400">{texts.effectivePlanTemplateUnsupported}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                {submitError ? (
                  <div className="flex-1 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {submitError}
                  </div>
                ) : null}
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleGoBack} 
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {texts.cancel}
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-8 py-2.5 text-sm font-semibold text-white bg-[#F59E0B] hover:bg-[#D97706] rounded-lg shadow-sm shadow-amber-200 transition-all"
                >
                  {texts.createProject}
                </Button>
              </div>
            </form>
          </Form>
        </RHFFormProvider>
      </div>
    </div>
  )
}

export default CreateProjectPage

interface SwarmConfigFormProps {
  value: string
  onChange: (value: string) => void
}

const parseJSONC = (value: string): OpencodeConfig | null => {
  try {
    const clean = stripComments(value)
    return parse(clean) as OpencodeConfig
  } catch {
    return null
  }
}

function SwarmConfigForm({ value, onChange }: SwarmConfigFormProps) {
  const initialConfig = useMemo(() => {
    if (value.trim()) {
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    methods.reset(initialConfig)
  }, [initialConfig, methods])

  useEffect(() => {
    const subscription = methods.watch((formData) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        const cleanedData = JSON.parse(JSON.stringify(formData, (_, item) => item ?? undefined))
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
    <RHFFormProvider {...methods}>
      <EmbeddedConfigEditor
        defaultSection="agents-primary"
        modelSelectorConfig={discovery.modelSelector}
        isLoadingModels={discovery.loadingModels}
        onRefreshModels={discovery.refreshModels}
        isRefreshingModels={discovery.isRefreshing}
      />
    </RHFFormProvider>
  )
}
