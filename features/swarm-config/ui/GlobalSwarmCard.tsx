'use client'

import { Hexagon, Folder, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SwarmAccent = 'amber' | 'violet' | 'teal'

interface GlobalSwarmCardTexts {
  unknown: string
  defaultAgent: string
  mcp: string
  skills: string
  editSwarm: string
  edit: string
  deleteSwarm: string
  delete: string
  cannotDeletePrefix: string
  cannotDeleteSuffix: string
  defaultModel: string
  projectsInUseSuffix: string
  unused: string
  createdAt: string
  initPlanTitle: string
  initPlanHint: string
  initFiles: string
  initDirectories: string
  initSkillEntries: string
  initTemplateSource: string
  initTemplateDisabled: string
  initTemplateUnsupported: string
  initTemplateBranch: string
  initNone: string
  sourceOfficial: string
  sourceCustom: string
  cannotEditOfficial: string
  cannotDeleteOfficial: string
  cloneToCustom: string
  cloneOfficialSwarm: string
  preview: string
  previewSwarm: string
  agentConfig: string
  mcpConfig: string
  projectRules: string
  agentGuide: string
}

const defaultTexts: GlobalSwarmCardTexts = {
  unknown: 'Unknown',
  defaultAgent: 'Default Agent',
  mcp: 'MCP',
  skills: 'Skills',
  editSwarm: 'Edit Swarm',
  edit: 'Edit',
  deleteSwarm: 'Delete Swarm',
  delete: 'Delete',
  cannotDeletePrefix: 'Cannot delete: ',
  cannotDeleteSuffix: ' projects are using this swarm',
  defaultModel: 'Default Model',
  projectsInUseSuffix: ' projects in use',
  unused: 'Not used',
  createdAt: 'Created at',
  initPlanTitle: 'Initialization Plan',
  initPlanHint: 'Files and folders copied when this swarm is applied to a project',
  initFiles: 'Files',
  initDirectories: 'Directories',
  initSkillEntries: 'Skill entries',
  initTemplateSource: 'Template Source',
  initTemplateDisabled: 'Template source not configured',
  initTemplateUnsupported: 'Template clone is not supported yet',
  initTemplateBranch: 'Branch',
  initNone: 'None',
  sourceOfficial: 'Official',
  sourceCustom: 'Custom',
  cannotEditOfficial: 'Official swarm cannot be edited',
  cannotDeleteOfficial: 'Official swarm cannot be deleted',
  cloneToCustom: 'Clone to custom',
  cloneOfficialSwarm: 'Clone official swarm',
  preview: 'Preview',
  previewSwarm: 'Preview swarm',
  agentConfig: 'Agent Config',
  mcpConfig: 'MCP Config',
  projectRules: 'Project Rules',
  agentGuide: 'Agent Guide',
}

function formatDate(date: string | Date | null | undefined, unknown: string): string {
  if (!date) return unknown
  try {
    if (typeof date === 'string') {
      return date.split('T')[0] // 返回 YYYY-MM-DD 部分
    }
    if (date instanceof Date) {
      const time = date.getTime()
      if (isNaN(time)) return unknown
      return date.toISOString().split('T')[0]
    }
    return unknown
  } catch {
    return unknown
  }
}

export interface SwarmTemplateSourceSummary {
  includeTemplate: boolean
  templateGitUrl?: string | null
  templateBranch?: string | null
  cloneSupported: boolean
}

export interface SwarmInitPlanSummary {
  files: string[]
  directories: string[]
  skillEntries: string[]
  templateSource: SwarmTemplateSourceSummary
}

export interface GlobalSwarmSummary {
  id: string
  sourceType?: string
  name: string
  description: string | null
  cli: string
  defaultModelId?: string | null // 默认模型
  agents: string[]
  skillsCount: number
  mcpsCount: number
  accent: SwarmAccent | null
  projectsCount: number // 被多少项目使用
  createdAt: string | Date | null
  // 编辑时需要的额外字段
  ohMyOpencodeJson?: string | null
  opencodeJson?: string | null
  skillsJson?: string | null
  // 新增：项目规则文档
  claudeMd?: string | null
  agentsMd?: string | null
  // 新增：项目模板
  includeTemplate?: boolean
  templateGitUrl?: string | null
  templateBranch?: string | null
  initPlan?: SwarmInitPlanSummary
}

interface GlobalSwarmCardProps {
  swarm: GlobalSwarmSummary
  onPreview?: (id: string) => void
  texts?: GlobalSwarmCardTexts
}

const accentStyles: Record<SwarmAccent, { icon: string; badge: string }> = {
  amber: {
    icon: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  violet: {
    icon: 'bg-violet-100 text-violet-700',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  teal: {
    icon: 'bg-teal-100 text-teal-700',
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
  },
}

export function GlobalSwarmCard({ swarm, onPreview, texts = defaultTexts }: GlobalSwarmCardProps) {
  const isOfficial = swarm.sourceType === 'official'
  const accent = swarm.accent || 'amber'
  const styles = accentStyles[accent]
  const initPlan = swarm.initPlan
  const skillEntriesCount = initPlan?.skillEntries.length || 0
  const filesCount = initPlan?.files.length || 0
  const directoriesCount = initPlan?.directories.length || 0
  const templateSource = initPlan?.templateSource
  const templateSourceText = templateSource?.includeTemplate
    ? (templateSource.templateGitUrl || texts.initNone)
    : texts.initTemplateDisabled
  const agentsPreview = swarm.agents.slice(0, 3)
  const remainingAgents = Math.max(swarm.agents.length - agentsPreview.length, 0)
  const hasAgentConfig = Boolean(swarm.ohMyOpencodeJson && swarm.ohMyOpencodeJson.trim().length > 0)
  const hasMcpConfig = Boolean(swarm.opencodeJson && swarm.opencodeJson.trim().length > 0)
  const hasProjectRules = Boolean(swarm.claudeMd && swarm.claudeMd.trim().length > 0)
  const hasAgentGuide = Boolean(swarm.agentsMd && swarm.agentsMd.trim().length > 0)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_320px] md:gap-4 md:p-4">
        <div className="min-w-0">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', styles.icon)}>
                <Hexagon className="h-4 w-4" />
              </div>
              <h3 className="truncate text-sm font-semibold text-card-foreground">{swarm.name}</h3>
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {isOfficial ? texts.sourceOfficial : texts.sourceCustom}
              </span>
            </div>
            {swarm.description ? (
              <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{swarm.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded border border-border px-1.5 py-0.5">{swarm.cli}</span>
              <span className="rounded border border-border px-1.5 py-0.5">{texts.mcp}: {swarm.mcpsCount}</span>
              <span className="rounded border border-border px-1.5 py-0.5">{texts.skills}: {swarm.skillsCount}</span>
              {swarm.defaultModelId ? (
                <span className="max-w-[280px] truncate rounded border border-border px-1.5 py-0.5">
                  {texts.defaultModel}: {swarm.defaultModelId}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agentsPreview.map((agent) => (
                <span
                  key={agent}
                  className={cn('inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium', styles.badge)}
                >
                  {agent}
                </span>
              ))}
              {remainingAgents > 0 ? (
                <span className="inline-flex items-center rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  +{remainingAgents}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('rounded border px-1.5 py-0.5', hasAgentConfig ? 'border-border' : 'border-border/60 opacity-70')}>
                {texts.agentConfig}
              </span>
              <span className={cn('rounded border px-1.5 py-0.5', hasMcpConfig ? 'border-border' : 'border-border/60 opacity-70')}>
                {texts.mcpConfig}
              </span>
              <span className={cn('rounded border px-1.5 py-0.5', hasProjectRules ? 'border-border' : 'border-border/60 opacity-70')}>
                {texts.projectRules}
              </span>
              <span className={cn('rounded border px-1.5 py-0.5', hasAgentGuide ? 'border-border' : 'border-border/60 opacity-70')}>
                {texts.agentGuide}
              </span>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onPreview?.(swarm.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={texts.previewSwarm}
              aria-label={texts.preview}
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="mb-1 text-[11px] font-medium text-foreground">{texts.initPlanTitle}</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{texts.initFiles}: {filesCount}</span>
              <span>{texts.initDirectories}: {directoriesCount}</span>
              <span>{texts.initSkillEntries}: {skillEntriesCount}</span>
              <span className="truncate" title={templateSourceText}>{texts.initTemplateSource}: {templateSourceText}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded border border-border px-1.5 py-0.5">{texts.mcp}: {swarm.mcpsCount}</span>
            <span className="rounded border border-border px-1.5 py-0.5">{texts.skills}: {swarm.skillsCount}</span>
            <span className="rounded border border-border px-1.5 py-0.5">
              {swarm.projectsCount > 0 ? `${swarm.projectsCount}${texts.projectsInUseSuffix}` : texts.unused}
            </span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5 md:col-span-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Folder className="w-3.5 h-3.5" />
            <span className="text-[11px]">
              {swarm.projectsCount > 0
                ? `${swarm.projectsCount}${texts.projectsInUseSuffix}`
                : texts.unused}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {texts.createdAt} {formatDate(swarm.createdAt, texts.unknown)}
          </span>
        </div>
      </div>
    </div>
  )
}
