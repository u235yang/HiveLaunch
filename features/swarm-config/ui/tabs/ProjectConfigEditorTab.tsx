'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
// @ts-expect-error
import { useRouter } from 'next/navigation'
import { parse, stripComments } from 'jsonc-parser'
import { Hexagon, Loader2, RefreshCw, Save } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider as RHFFormProvider, useForm } from 'react-hook-form'
import {
  Button,
  EmbeddedConfigEditor,
  Switch,
  Textarea,
  defaultMockConfig,
  opencodeConfigSchema,
  type OpencodeConfig,
} from '@shared/ui'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { useProjectStore } from '@/features/shared/store'
import { getSkillsHubStatus } from '@/features/settings/lib/skills-api'
import { applyProjectSwarmConfig, readProjectConfig } from '../../lib/swarm-config-api'

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

interface ProjectSwarmBinding {
  id: string
  projectId: string
  swarmTemplateId: string
  isActive: boolean
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

interface ProjectConfigEditorTabProps {
  projectId: string
  texts?: ProjectConfigEditorTexts
}

interface ProjectConfigEditorTexts {
  noSwarmBound: string
  description: string
  save: string
  saving: string
  saved: string
  loadingSwarms: string
  swarmGroupOfficial: string
  swarmGroupCustom: string
  noSwarms: string
  swarmNoDescription: string
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
  missingSkillsBeforeApply: string
  missingSkillsAndMore: string
  skillsHubChecking: string
  skillsHubReadyPrefix: string
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
  applyFailed: string
  loadFailed: string
  selectSwarmFirst: string
}

const DEFAULT_OPENCODE_CONFIG_TEXT = '{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {}\n}'

const defaultTexts: ProjectConfigEditorTexts = {
  noSwarmBound: 'No swarm bound yet. Select one for this project',
  description: 'Use the same swarm interaction as project creation and re-apply capabilities to this project.',
  save: 'Apply to Project',
  saving: 'Applying...',
  saved: 'Applied successfully',
  loadingSwarms: 'Loading swarms...',
  swarmGroupOfficial: 'Official Swarms',
  swarmGroupCustom: 'Custom Swarms',
  noSwarms: 'No swarms available',
  swarmNoDescription: 'No description',
  swarmCapabilities: 'Swarm Capabilities',
  capabilityHint: 'Enable all by default, then trim capability scope as needed.',
  capabilityAgentConfig: 'Agent Config',
  capabilitySkills: 'Skills',
  capabilityRules: 'Rules Docs',
  capabilityTemplate: 'Project Template',
  capabilityTemplateSwitch: 'Clone template on apply',
  capabilityTemplateRepo: 'Template Git URL',
  capabilityTemplateBranch: 'Template Branch',
  capabilityTemplateRepoPlaceholder: 'https://github.com/xxx/template.git',
  capabilityTemplateBranchPlaceholder: 'master',
  capabilityAgentConfigOhMy: 'oh-my-opencode config',
  capabilityAgentConfigOpencode: 'opencode config',
  capabilityRulesClaude: 'CLAUDE.md content',
  capabilityRulesAgents: 'AGENTS.md content',
  effectivePlanTitle: 'Effective Plan',
  effectivePlanHint: 'The current selection will be applied to this project immediately.',
  effectivePlanWillWriteFiles: 'Write files',
  effectivePlanWillCreateDirs: 'Create directories',
  effectivePlanWillSyncSkills: 'Sync skills',
  effectivePlanTemplateSource: 'Template source',
  effectivePlanDisabled: 'Disabled',
  effectivePlanNone: 'None',
  effectivePlanMoreItems: 'more',
  effectivePlanTemplateUnsupported: 'Template clone is currently not implemented, source info is displayed only.',
  skillsHubCheckFailed: 'Failed to check Skills Hub status',
  missingSkillsTitle: 'Missing skills in local hub',
  missingSkillsHint: 'Install missing skills first to avoid partial project capability apply.',
  missingSkillsGoSettings: 'Go to Settings',
  missingSkillsBeforeApply: 'Install missing skills before applying',
  missingSkillsAndMore: 'more',
  skillsHubChecking: 'Checking Skills Hub...',
  skillsHubReadyPrefix: 'Installed Skills:',
  addSkills: 'Add Skills',
  refreshHubSkills: 'Refresh Hub',
  templateSkillsCountLabel: 'Template Skills',
  projectSkillsCountLabel: 'Project Skills',
  hubSkillsCountLabel: 'Skills Hub Skills',
  selectedProjectSkillsTitle: 'Project skills to sync',
  noSelectedProjectSkills: 'No project skills selected',
  noHubSkills: 'No installed skills in Skills Hub',
  addSelectedFromHub: 'Add selected skills',
  noHubSkillsSelected: 'Select at least one hub skill',
  templateSkillTag: 'Template',
  applyFailed: 'Failed to apply swarm config',
  loadFailed: 'Failed to load swarm data',
  selectSwarmFirst: 'Select a swarm first',
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

const parseJSONC = (value: string): OpencodeConfig | null => {
  try {
    const clean = stripComments(value)
    return parse(clean) as OpencodeConfig
  } catch {
    return null
  }
}

export function ProjectConfigEditorTab({ projectId, texts = defaultTexts }: ProjectConfigEditorTabProps) {
  const router = useRouter()
  const currentProject = useProjectStore((state) => state.currentProject)
  const repoPath = currentProject?.repoPath
  const [swarms, setSwarms] = useState<SwarmOption[]>([])
  const [selectedSwarm, setSelectedSwarm] = useState<SwarmOption | null>(null)
  const [projectSkillEntries, setProjectSkillEntries] = useState<string[]>([])
  const [selectedHubSkills, setSelectedHubSkills] = useState<string[]>([])
  const [installedSkills, setInstalledSkills] = useState<string[]>([])
  const [isCheckingSkillsHub, setIsCheckingSkillsHub] = useState(false)
  const [skillsHubCheckFailed, setSkillsHubCheckFailed] = useState(false)
  const [showAddSkillsPanel, setShowAddSkillsPanel] = useState(false)
  const [isLoadingSwarms, setIsLoadingSwarms] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityDraft>({
    agentConfig: true,
    skills: true,
    rules: true,
    template: false,
    ohMyOpencodeJson: '',
    opencodeJson: '',
    claudeMd: '',
    agentsMd: '',
    includeTemplate: false,
    templateGitUrl: '',
    templateBranch: 'master',
  })

  useEffect(() => {
    if (!projectId) return
    let active = true
    setIsLoadingSwarms(true)
    setError(null)
    Promise.all([
      fetch(resolveHttpUrl('/api/swarms')).then((response) => {
        if (!response.ok) throw new Error(texts.loadFailed)
        return response.json() as Promise<SwarmOption[]>
      }),
      fetch(resolveHttpUrl(`/api/projects/${projectId}/swarm-bindings`)).then((response) => {
        if (!response.ok) throw new Error(texts.loadFailed)
        return response.json() as Promise<ProjectSwarmBinding[]>
      }),
      repoPath ? readProjectConfig(repoPath).catch(() => null) : Promise.resolve(null),
    ])
      .then(([swarmList, bindings, projectConfig]) => {
        if (!active) return
        setSwarms(swarmList)
        const activeBinding = bindings.find((binding) => binding.isActive)
        const defaultSwarm = activeBinding
          ? swarmList.find((swarm) => swarm.id === activeBinding.swarmTemplateId) || null
          : swarmList[0] || null
        if (defaultSwarm) {
          const baseSkills = (defaultSwarm.initPlan?.skillEntries || []).map(getSkillDisplayName)
          const projectSkills = (projectConfig?.skills || []).map(getSkillDisplayName)
          const initialProjectSkills = projectSkills.length > 0
            ? [...new Set([...baseSkills, ...projectSkills])]
            : baseSkills
          setSelectedSwarm(defaultSwarm)
          setProjectSkillEntries(initialProjectSkills)
          setCapabilityDraft({
            agentConfig: true,
            skills: true,
            rules: true,
            template: false,
            ohMyOpencodeJson: defaultSwarm.ohMyOpencodeJson || '',
            opencodeJson: defaultSwarm.opencodeJson || DEFAULT_OPENCODE_CONFIG_TEXT,
            claudeMd: defaultSwarm.claudeMd || '',
            agentsMd: defaultSwarm.agentsMd || '',
            includeTemplate: defaultSwarm.includeTemplate || false,
            templateGitUrl: defaultSwarm.templateGitUrl || '',
            templateBranch: defaultSwarm.templateBranch || 'master',
          })
        }
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : texts.loadFailed)
      })
      .finally(() => {
        if (!active) return
        setIsLoadingSwarms(false)
      })

    return () => {
      active = false
    }
  }, [projectId, repoPath, texts.loadFailed])

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

  const handleSelectSwarm = (swarm: SwarmOption) => {
    const baseSkills = (swarm.initPlan?.skillEntries || []).map(getSkillDisplayName)
    setSelectedSwarm(swarm)
    setProjectSkillEntries(baseSkills)
    setSelectedHubSkills([])
    setCapabilityDraft({
      agentConfig: true,
      skills: true,
      rules: true,
      template: false,
      ohMyOpencodeJson: swarm.ohMyOpencodeJson || '',
      opencodeJson: swarm.opencodeJson || DEFAULT_OPENCODE_CONFIG_TEXT,
      claudeMd: swarm.claudeMd || '',
      agentsMd: swarm.agentsMd || '',
      includeTemplate: swarm.includeTemplate || false,
      templateGitUrl: swarm.templateGitUrl || '',
      templateBranch: swarm.templateBranch || 'master',
    })
  }

  const templateSkillEntries = useMemo(() => {
    if (!selectedSwarm || !capabilityDraft.skills) return []
    return (selectedSwarm.initPlan?.skillEntries || []).map(getSkillDisplayName)
  }, [selectedSwarm, capabilityDraft.skills])

  useEffect(() => {
    setProjectSkillEntries((prev) => [...new Set([...templateSkillEntries, ...prev])])
  }, [templateSkillEntries])

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
    const directories = selectedSwarm.initPlan?.directories || []
    const skillDirs = directories.filter((dir) => dir.replaceAll('\\', '/').startsWith('.opencode/skills'))
    const result: string[] = []
    if (capabilityDraft.skills) result.push(...skillDirs)
    return result
  }, [selectedSwarm, capabilityDraft.skills])

  const effectiveSkillEntries = useMemo(() => {
    if (!capabilityDraft.skills) return []
    return projectSkillEntries
  }, [capabilityDraft.skills, projectSkillEntries])

  const installedSkillSet = useMemo(() => new Set(installedSkills), [installedSkills])
  const missingSkillEntries = useMemo(
    () => effectiveSkillEntries.filter((skill) => !installedSkillSet.has(skill)),
    [effectiveSkillEntries, installedSkillSet]
  )
  const missingSkillPreview = missingSkillEntries.slice(0, 6)
  const remainingMissingSkillCount = Math.max(missingSkillEntries.length - missingSkillPreview.length, 0)

  const toggleHubSkillSelection = (skill: string) => {
    setSelectedHubSkills((prev) => (prev.includes(skill) ? prev.filter((item) => item !== skill) : [...prev, skill]))
  }

  const handleAddSelectedFromHub = () => {
    if (selectedHubSkills.length === 0) {
      setError(texts.noHubSkillsSelected)
      return
    }
    setError(null)
    setProjectSkillEntries((prev) => [...new Set([...prev, ...selectedHubSkills])])
    setSelectedHubSkills([])
    setShowAddSkillsPanel(false)
  }

  const handleRemoveProjectSkill = (skill: string) => {
    setProjectSkillEntries((prev) => prev.filter((item) => item !== skill))
  }

  const handleApply = async () => {
    if (!projectId || !repoPath) return
    if (!selectedSwarm) {
      setError(texts.selectSwarmFirst)
      return
    }
    if (capabilityDraft.skills && missingSkillEntries.length > 0) {
      const preview = missingSkillPreview.join(', ')
      const more = remainingMissingSkillCount > 0 ? ` +${remainingMissingSkillCount}` : ''
      setError(`${texts.missingSkillsBeforeApply}: ${preview}${more}`)
      return
    }
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await applyProjectSwarmConfig(projectId, {
        swarm_id: selectedSwarm.id,
        capability_scope: {
          agent_config: capabilityDraft.agentConfig,
          skills: capabilityDraft.skills,
          rules: capabilityDraft.rules,
          template: false,
        },
        capability_overrides: {
          oh_my_opencode_json: capabilityDraft.agentConfig ? capabilityDraft.ohMyOpencodeJson : undefined,
          opencode_json: capabilityDraft.agentConfig ? capabilityDraft.opencodeJson : undefined,
          claude_md: capabilityDraft.rules ? capabilityDraft.claudeMd : undefined,
          agents_md: capabilityDraft.rules ? capabilityDraft.agentsMd : undefined,
          project_skills: capabilityDraft.skills ? projectSkillEntries : [],
          include_template: false,
          template_git_url: undefined,
          template_branch: undefined,
        },
      })
      setSuccessMessage(texts.saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : texts.applyFailed)
    } finally {
      setIsSaving(false)
    }
  }

  const officialSwarms = swarms.filter((swarm) => swarm.sourceType === 'official')
  const customSwarms = swarms.filter((swarm) => swarm.sourceType !== 'official')

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{texts.description}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {successMessage ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{successMessage}</p> : null}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium text-foreground">{texts.swarmGroupOfficial}</div>
        {isLoadingSwarms ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {texts.loadingSwarms}
          </div>
        ) : officialSwarms.length === 0 ? (
          <div className="text-xs text-muted-foreground">{texts.noSwarms}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {officialSwarms.map((swarm) => {
              const selected = selectedSwarm?.id === swarm.id
              return (
                <button
                  key={swarm.id}
                  type="button"
                  onClick={() => handleSelectSwarm(swarm)}
                  className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs transition ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {swarm.name}
                </button>
              )
            })}
          </div>
        )}
        {customSwarms.length > 0 ? (
          <>
            <div className="pt-2 text-sm font-medium text-foreground">{texts.swarmGroupCustom}</div>
            <div className="flex flex-wrap gap-2">
              {customSwarms.map((swarm) => {
                const selected = selectedSwarm?.id === swarm.id
                return (
                  <button
                    key={swarm.id}
                    type="button"
                    onClick={() => handleSelectSwarm(swarm)}
                    className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs transition ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {swarm.name}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
        {selectedSwarm ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Hexagon className="h-3.5 w-3.5" />
              <span className="font-medium">{selectedSwarm.name}</span>
            </div>
            <p className="mt-1">{selectedSwarm.description || texts.swarmNoDescription}</p>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{texts.noSwarmBound}</div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium text-foreground">{texts.swarmCapabilities}</div>
        <p className="text-xs text-muted-foreground">{texts.capabilityHint}</p>
        <label className="flex items-center justify-between rounded-md border border-border bg-background p-2">
          <span className="text-sm text-foreground">{texts.capabilityAgentConfig}</span>
          <Switch checked={capabilityDraft.agentConfig} onCheckedChange={(checked) => setCapabilityDraft((prev) => ({ ...prev, agentConfig: checked }))} />
        </label>
        {capabilityDraft.agentConfig ? (
          <div className="space-y-3 rounded-md border border-border bg-background p-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{texts.capabilityAgentConfigOhMy}</label>
              <SwarmConfigForm
                value={capabilityDraft.ohMyOpencodeJson}
                onChange={(value) => setCapabilityDraft((prev) => ({ ...prev, ohMyOpencodeJson: value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{texts.capabilityAgentConfigOpencode}</label>
              <Textarea
                value={capabilityDraft.opencodeJson}
                onChange={(event) => setCapabilityDraft((prev) => ({ ...prev, opencodeJson: event.target.value }))}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
          </div>
        ) : null}

        <label className="flex items-center justify-between rounded-md border border-border bg-background p-2">
          <span className="text-sm text-foreground">{texts.capabilitySkills}</span>
          <Switch checked={capabilityDraft.skills} onCheckedChange={(checked) => setCapabilityDraft((prev) => ({ ...prev, skills: checked }))} />
        </label>
        {capabilityDraft.skills ? (
          <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{texts.selectedProjectSkillsTitle}</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={refreshSkillsHubStatus} className="h-7 text-xs">
                  <RefreshCw className={`mr-1 h-3 w-3 ${isCheckingSkillsHub ? 'animate-spin' : ''}`} />
                  {texts.refreshHubSkills}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddSkillsPanel((prev) => !prev)} className="h-7 text-xs">
                  {texts.addSkills}
                </Button>
              </div>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <p>{texts.templateSkillsCountLabel}: {templateSkillEntries.length}</p>
              <p>{texts.projectSkillsCountLabel}: {effectiveSkillEntries.length}</p>
              <p>{isCheckingSkillsHub ? texts.skillsHubChecking : `${texts.hubSkillsCountLabel}: ${installedSkills.length}`}</p>
            </div>
            {skillsHubCheckFailed ? <p className="text-amber-600 dark:text-amber-400">{texts.skillsHubCheckFailed}</p> : null}
            {effectiveSkillEntries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {effectiveSkillEntries.map((skill) => {
                  const isTemplateSkill = templateSkillEntries.includes(skill)
                  const available = installedSkillSet.has(skill)
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => handleRemoveProjectSkill(skill)}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                        isTemplateSkill
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : available
                            ? 'border-border bg-muted text-foreground'
                            : 'border-amber-400/40 bg-amber-100/40 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                      }`}
                    >
                      {skill}
                      {isTemplateSkill ? ` · ${texts.templateSkillTag}` : ''}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-muted-foreground">{texts.noSelectedProjectSkills}</p>
            )}
            {showAddSkillsPanel ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
                {installedSkills.length === 0 ? (
                  <p className="text-muted-foreground">{texts.noHubSkills}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {installedSkills.map((skill) => {
                      const selected = selectedHubSkills.includes(skill)
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleHubSkillSelection(skill)}
                          className={`rounded-full border px-2 py-0.5 ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
                        >
                          {skill}
                        </button>
                      )
                    })}
                  </div>
                )}
                <Button type="button" size="sm" onClick={handleAddSelectedFromHub} className="h-8 text-xs" disabled={selectedHubSkills.length === 0}>
                  {texts.addSelectedFromHub}
                </Button>
              </div>
            ) : null}
            {missingSkillEntries.length > 0 ? (
              <div className="rounded-md border border-amber-400/40 bg-amber-100/30 p-2 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                <p className="font-medium">{texts.missingSkillsTitle}</p>
                <p>{texts.missingSkillsHint}</p>
                <p className="mt-1">
                  {missingSkillPreview.join(', ')}
                  {remainingMissingSkillCount > 0 ? ` +${remainingMissingSkillCount} ${texts.missingSkillsAndMore}` : ''}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => router.push('/settings?tab=skills')} className="mt-2 h-7 text-xs">
                  {texts.missingSkillsGoSettings}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="flex items-center justify-between rounded-md border border-border bg-background p-2">
          <span className="text-sm text-foreground">{texts.capabilityRules}</span>
          <Switch checked={capabilityDraft.rules} onCheckedChange={(checked) => setCapabilityDraft((prev) => ({ ...prev, rules: checked }))} />
        </label>
        {capabilityDraft.rules ? (
          <div className="space-y-3 rounded-md border border-border bg-background p-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{texts.capabilityRulesClaude}</label>
              <Textarea value={capabilityDraft.claudeMd} onChange={(event) => setCapabilityDraft((prev) => ({ ...prev, claudeMd: event.target.value }))} rows={8} className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{texts.capabilityRulesAgents}</label>
              <Textarea value={capabilityDraft.agentsMd} onChange={(event) => setCapabilityDraft((prev) => ({ ...prev, agentsMd: event.target.value }))} rows={8} className="font-mono text-xs" />
            </div>
          </div>
        ) : null}

      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-xs">
        <div className="font-medium text-foreground">{texts.effectivePlanTitle}</div>
        <p className="text-muted-foreground">{texts.effectivePlanHint}</p>
        <p className="text-muted-foreground">
          {texts.effectivePlanWillWriteFiles}: {effectiveFiles.length > 0 ? effectiveFiles.join(', ') : texts.effectivePlanNone}
        </p>
        <p className="text-muted-foreground">
          {texts.effectivePlanWillCreateDirs}: {effectiveDirectories.length > 0 ? effectiveDirectories.join(', ') : texts.effectivePlanNone}
        </p>
        <p className="text-muted-foreground">
          {texts.effectivePlanWillSyncSkills}: {effectiveSkillEntries.length > 0 ? effectiveSkillEntries.slice(0, 6).join(', ') : texts.effectivePlanNone}
          {effectiveSkillEntries.length > 6 ? ` +${effectiveSkillEntries.length - 6} ${texts.effectivePlanMoreItems}` : ''}
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleApply} disabled={!selectedSwarm || isSaving || !repoPath}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isSaving ? texts.saving : texts.save}
        </Button>
      </div>
    </div>
  )
}

interface SwarmConfigFormProps {
  value: string
  onChange: (value: string) => void
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
