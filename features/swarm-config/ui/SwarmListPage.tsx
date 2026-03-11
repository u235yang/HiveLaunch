'use client'

import { useEffect, useMemo, useState } from 'react'
import { Hexagon } from 'lucide-react'
import { FormProvider, useForm } from 'react-hook-form'
import { parse, stripComments } from 'jsonc-parser'
import { Dialog, DialogContent, DialogHeader, DialogTitle, EmbeddedConfigEditor, opencodeConfigSchema, Textarea, Toaster, type OpencodeConfig } from '@shared/ui'
import { GlobalSwarmCard, type GlobalSwarmSummary } from './GlobalSwarmCard'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'

interface SwarmListPageTexts {
  title: string
  addSwarm: string
  addShort: string
  addCustomSwarm: string
  loading: string
  description: string
  emptyTitle: string
  emptyHint: string
  unknownError: string
  fetchError: string
  createError: string
  updateError: string
  deleteError: string
  cardUnknown: string
  cardDefaultAgent: string
  cardMcp: string
  cardSkills: string
  cardEditSwarm: string
  cardEdit: string
  cardDeleteSwarm: string
  cardDelete: string
  cardCannotDeletePrefix: string
  cardCannotDeleteSuffix: string
  cardDefaultModel: string
  cardProjectsInUseSuffix: string
  cardUnused: string
  cardCreatedAt: string
  cardInitPlanTitle: string
  cardInitPlanHint: string
  cardInitFiles: string
  cardInitDirectories: string
  cardInitSkillEntries: string
  cardInitTemplateSource: string
  cardInitTemplateDisabled: string
  cardInitTemplateUnsupported: string
  cardInitTemplateBranch: string
  cardInitNone: string
  sectionOfficial: string
  sectionCustom: string
  cardSourceOfficial: string
  cardSourceCustom: string
  cardCannotEditOfficial: string
  cardCannotDeleteOfficial: string
  cardCloneToCustom: string
  cardCloneOfficialSwarm: string
  cardPreview: string
  cardPreviewSwarm: string
  cardAgentConfig: string
  cardMcpConfig: string
  cardProjectRules: string
  cardAgentGuide: string
  previewTitle: string
  previewOhMyOpencode: string
  previewMcpConfig: string
  previewSkills: string
  previewClaudeMd: string
  previewAgentsMd: string
  previewCapabilityOverview: string
  previewAppliesOnProject: string
  previewAgentVisual: string
  previewAgentVisualHint: string
  previewAgentJsonRaw: string
  previewMcpServers: string
  previewMcpRaw: string
  previewInitializationAssets: string
  previewTemplateSource: string
  previewTemplateBranch: string
  previewNoTemplateSource: string
  previewFiles: string
  previewDirectories: string
  previewSkillEntries: string
  previewNoItems: string
  previewReadOnlyHint: string
}

const defaultTexts: SwarmListPageTexts = {
  title: 'Swarm Config',
  addSwarm: 'Add Swarm',
  addShort: 'Add',
  addCustomSwarm: 'Add Custom Swarm',
  loading: 'Loading swarm data...',
  description: 'Manage platform AI swarm templates.',
  emptyTitle: 'No swarm config yet',
  emptyHint: 'Click "Add Swarm" to create the first template',
  unknownError: 'Unknown error',
  fetchError: 'Failed to fetch swarms',
  createError: 'Failed to create swarm',
  updateError: 'Failed to update swarm',
  deleteError: 'Failed to delete swarm',
  cardUnknown: 'Unknown',
  cardDefaultAgent: 'Default Agent',
  cardMcp: 'MCP',
  cardSkills: 'Skills',
  cardEditSwarm: 'Edit Swarm',
  cardEdit: 'Edit',
  cardDeleteSwarm: 'Delete Swarm',
  cardDelete: 'Delete',
  cardCannotDeletePrefix: 'Cannot delete: ',
  cardCannotDeleteSuffix: ' projects are using this swarm',
  cardDefaultModel: 'Default Model',
  cardProjectsInUseSuffix: ' projects in use',
  cardUnused: 'Not used',
  cardCreatedAt: 'Created at',
  cardInitPlanTitle: 'Initialization Plan',
  cardInitPlanHint: 'Files and folders copied when applying this swarm',
  cardInitFiles: 'Files',
  cardInitDirectories: 'Directories',
  cardInitSkillEntries: 'Skill entries',
  cardInitTemplateSource: 'Template Source',
  cardInitTemplateDisabled: 'Not configured',
  cardInitTemplateUnsupported: 'Template clone is not supported yet',
  cardInitTemplateBranch: 'Branch',
  cardInitNone: 'None',
  sectionOfficial: 'Official Swarms',
  sectionCustom: 'Custom Swarms',
  cardSourceOfficial: 'Official',
  cardSourceCustom: 'Custom',
  cardCannotEditOfficial: 'Official swarm cannot be edited',
  cardCannotDeleteOfficial: 'Official swarm cannot be deleted',
  cardCloneToCustom: 'Clone to custom',
  cardCloneOfficialSwarm: 'Clone official swarm',
  cardPreview: 'Preview',
  cardPreviewSwarm: 'Preview swarm',
  cardAgentConfig: 'Agent Config',
  cardMcpConfig: 'MCP Config',
  cardProjectRules: 'Project Rules',
  cardAgentGuide: 'Agent Guide',
  previewTitle: 'Swarm Config Preview',
  previewOhMyOpencode: 'Agent Config (oh-my-opencode.jsonc)',
  previewMcpConfig: 'MCP Config (opencode.json)',
  previewSkills: 'Skills',
  previewClaudeMd: 'Project Rules (CLAUDE.md)',
  previewAgentsMd: 'Agent Guide (AGENTS.md)',
  previewCapabilityOverview: 'Capability Overview',
  previewAppliesOnProject: 'Applied when project creates or updates swarm scope',
  previewAgentVisual: 'Agent Visual Config',
  previewAgentVisualHint: 'This view is read-only and does not change swarm data',
  previewAgentJsonRaw: 'Agent Config Raw',
  previewMcpServers: 'MCP Servers',
  previewMcpRaw: 'MCP Raw Config',
  previewInitializationAssets: 'Initialization Assets',
  previewTemplateSource: 'Template Source',
  previewTemplateBranch: 'Template Branch',
  previewNoTemplateSource: 'No template source configured',
  previewFiles: 'Files',
  previewDirectories: 'Directories',
  previewSkillEntries: 'Skill Entries',
  previewNoItems: 'No items',
  previewReadOnlyHint: 'Preview only, not editable',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseJsoncValue(raw: string | null | undefined): unknown | null {
  if (!raw || !raw.trim()) return null
  try {
    return parse(stripComments(raw))
  } catch {
    return null
  }
}

function parseSkillNames(raw: string | null | undefined): string[] {
  const value = parseJsoncValue(raw)
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseMcpServerNames(raw: string | null | undefined): string[] {
  const value = parseJsoncValue(raw)
  if (!isRecord(value)) return []
  const mcp = value.mcp
  if (!isRecord(mcp)) return []
  const servers = mcp.servers
  if (!isRecord(servers)) return []
  return Object.keys(servers)
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

function PreviewAgentVisualizer({ rawConfig, texts }: { rawConfig: string | null | undefined; texts: SwarmListPageTexts }) {
  const parsedConfig = useMemo(() => {
    const parsed = parseJsoncValue(rawConfig)
    const result = opencodeConfigSchema.safeParse(parsed)
    return result.success ? result.data : null
  }, [rawConfig])
  const methods = useForm<OpencodeConfig>({ defaultValues: parsedConfig ?? undefined })
  const discovery = useExecutorDiscovery('OPENCODE')

  useEffect(() => {
    if (!parsedConfig) return
    methods.reset(parsedConfig)
  }, [methods, parsedConfig])

  if (!parsedConfig) {
    return (
      <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
        {texts.previewNoItems}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border p-2.5 text-[11px] text-muted-foreground">
        {texts.previewAgentVisualHint}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="relative h-[420px] overflow-hidden">
          <FormProvider {...methods}>
            <EmbeddedConfigEditor
              defaultSection="agents-primary"
              modelSelectorConfig={discovery.modelSelector}
              isLoadingModels={discovery.loadingModels}
              onRefreshModels={discovery.refreshModels}
              isRefreshingModels={discovery.isRefreshing}
            />
          </FormProvider>
          <div className="absolute inset-x-0 bottom-0 top-11 z-10 cursor-not-allowed" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

/**
 * 全局蜂群列表页（平台级）
 * 无需选择项目即可管理蜂群
 */
export function SwarmListPage({ texts = defaultTexts }: { texts?: SwarmListPageTexts }) {
  const [swarms, setSwarms] = useState<GlobalSwarmSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSwarm, setPreviewSwarm] = useState<GlobalSwarmSummary | null>(null)
  const officialSwarms = swarms.filter((swarm) => swarm.sourceType === 'official')
  const customSwarms = swarms.filter((swarm) => swarm.sourceType !== 'official')

  // 加载所有全局蜂群
  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)

    fetch(resolveHttpUrl('/api/swarms'))
      .then((response) => {
        if (!response.ok) throw new Error(texts.fetchError)
        return response.json()
      })
      .then((data: GlobalSwarmSummary[]) => {
        if (!active) return
        setSwarms(data)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : texts.unknownError)
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [texts.fetchError, texts.unknownError])

  const handlePreview = (id: string) => {
    setPreviewSwarm(swarms.find((swarm) => swarm.id === id) ?? null)
  }

  return (
    <>
      <Toaster />
      <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 h-14 md:h-16 flex items-center justify-between px-4 md:px-6 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Hexagon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <h1 className="text-base md:text-lg font-bold text-gray-900 dark:text-gray-100">{texts.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {error ? <p className="text-sm text-red-500 mb-4">{error}</p> : null}
        {isLoading && swarms.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">{texts.loading}</p>
        ) : null}

        <p className="text-sm text-gray-500 mb-4 md:mb-6 dark:text-gray-400">
          {texts.description}
        </p>

        {swarms.length === 0 && !isLoading ? (
          <div className="text-center py-8 md:py-12">
            <Hexagon className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-4 dark:text-gray-600" />
            <p className="text-gray-500 mb-2 text-sm md:text-base dark:text-gray-300">{texts.emptyTitle}</p>
            <p className="text-xs md:text-sm text-gray-400 mb-4 dark:text-gray-500">{texts.emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {officialSwarms.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{texts.sectionOfficial}</h2>
                <div className="space-y-2">
                  {officialSwarms.map((swarm) => (
                    <GlobalSwarmCard
                      key={swarm.id}
                      swarm={swarm}
                      onPreview={handlePreview}
                      texts={{
                        unknown: texts.cardUnknown,
                        defaultAgent: texts.cardDefaultAgent,
                        mcp: texts.cardMcp,
                        skills: texts.cardSkills,
                        editSwarm: texts.cardEditSwarm,
                        edit: texts.cardEdit,
                        deleteSwarm: texts.cardDeleteSwarm,
                        delete: texts.cardDelete,
                        cannotDeletePrefix: texts.cardCannotDeletePrefix,
                        cannotDeleteSuffix: texts.cardCannotDeleteSuffix,
                        defaultModel: texts.cardDefaultModel,
                        projectsInUseSuffix: texts.cardProjectsInUseSuffix,
                        unused: texts.cardUnused,
                        createdAt: texts.cardCreatedAt,
                        initPlanTitle: texts.cardInitPlanTitle,
                        initPlanHint: texts.cardInitPlanHint,
                        initFiles: texts.cardInitFiles,
                        initDirectories: texts.cardInitDirectories,
                        initSkillEntries: texts.cardInitSkillEntries,
                        initTemplateSource: texts.cardInitTemplateSource,
                        initTemplateDisabled: texts.cardInitTemplateDisabled,
                        initTemplateUnsupported: texts.cardInitTemplateUnsupported,
                        initTemplateBranch: texts.cardInitTemplateBranch,
                        initNone: texts.cardInitNone,
                        sourceOfficial: texts.cardSourceOfficial,
                        sourceCustom: texts.cardSourceCustom,
                        cannotEditOfficial: texts.cardCannotEditOfficial,
                        cannotDeleteOfficial: texts.cardCannotDeleteOfficial,
                        cloneToCustom: texts.cardCloneToCustom,
                        cloneOfficialSwarm: texts.cardCloneOfficialSwarm,
                        preview: texts.cardPreview,
                        previewSwarm: texts.cardPreviewSwarm,
                        agentConfig: texts.cardAgentConfig,
                        mcpConfig: texts.cardMcpConfig,
                        projectRules: texts.cardProjectRules,
                        agentGuide: texts.cardAgentGuide,
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{texts.sectionCustom}</h2>
              </div>
              {customSwarms.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{texts.emptyHint}</p>
              ) : (
                <div className="space-y-2">
                  {customSwarms.map((swarm) => (
                    <GlobalSwarmCard
                      key={swarm.id}
                      swarm={swarm}
                      onPreview={handlePreview}
                      texts={{
                        unknown: texts.cardUnknown,
                        defaultAgent: texts.cardDefaultAgent,
                        mcp: texts.cardMcp,
                        skills: texts.cardSkills,
                        editSwarm: texts.cardEditSwarm,
                        edit: texts.cardEdit,
                        deleteSwarm: texts.cardDeleteSwarm,
                        delete: texts.cardDelete,
                        cannotDeletePrefix: texts.cardCannotDeletePrefix,
                        cannotDeleteSuffix: texts.cardCannotDeleteSuffix,
                        defaultModel: texts.cardDefaultModel,
                        projectsInUseSuffix: texts.cardProjectsInUseSuffix,
                        unused: texts.cardUnused,
                        createdAt: texts.cardCreatedAt,
                        initPlanTitle: texts.cardInitPlanTitle,
                        initPlanHint: texts.cardInitPlanHint,
                        initFiles: texts.cardInitFiles,
                        initDirectories: texts.cardInitDirectories,
                        initSkillEntries: texts.cardInitSkillEntries,
                        initTemplateSource: texts.cardInitTemplateSource,
                        initTemplateDisabled: texts.cardInitTemplateDisabled,
                        initTemplateUnsupported: texts.cardInitTemplateUnsupported,
                        initTemplateBranch: texts.cardInitTemplateBranch,
                        initNone: texts.cardInitNone,
                        sourceOfficial: texts.cardSourceOfficial,
                        sourceCustom: texts.cardSourceCustom,
                        cannotEditOfficial: texts.cardCannotEditOfficial,
                        cannotDeleteOfficial: texts.cardCannotDeleteOfficial,
                        cloneToCustom: texts.cardCloneToCustom,
                        cloneOfficialSwarm: texts.cardCloneOfficialSwarm,
                        preview: texts.cardPreview,
                        previewSwarm: texts.cardPreviewSwarm,
                        agentConfig: texts.cardAgentConfig,
                        mcpConfig: texts.cardMcpConfig,
                        projectRules: texts.cardProjectRules,
                        agentGuide: texts.cardAgentGuide,
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      </div>
      <Dialog open={Boolean(previewSwarm)} onOpenChange={(open) => !open && setPreviewSwarm(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{texts.previewTitle} · {previewSwarm?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold text-foreground">{texts.previewCapabilityOverview}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{texts.previewAppliesOnProject}</div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{texts.previewAgentVisual}</p>
                <span className="text-[10px] text-muted-foreground">{texts.previewReadOnlyHint}</span>
              </div>
              <PreviewAgentVisualizer rawConfig={previewSwarm?.ohMyOpencodeJson} texts={texts} />
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{texts.previewAgentJsonRaw}</p>
                <Textarea value={previewSwarm?.ohMyOpencodeJson || texts.cardInitNone} readOnly rows={6} className="font-mono text-xs" />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">{texts.previewMcpConfig}</p>
              <div className="flex flex-wrap gap-1.5">
                {parseMcpServerNames(previewSwarm?.opencodeJson).map((name) => (
                  <span key={name} className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {name}
                  </span>
                ))}
                {parseMcpServerNames(previewSwarm?.opencodeJson).length === 0 ? (
                  <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{texts.previewNoItems}</span>
                ) : null}
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{texts.previewMcpRaw}</p>
                <Textarea value={previewSwarm?.opencodeJson || texts.cardInitNone} readOnly rows={7} className="font-mono text-xs" />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">{texts.previewSkills}</p>
              <div className="flex flex-wrap gap-1.5">
                {parseSkillNames(previewSwarm?.skillsJson).map((skill) => (
                  <span key={skill} className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {skill}
                  </span>
                ))}
                {parseSkillNames(previewSwarm?.skillsJson).length === 0 ? (
                  <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{texts.previewNoItems}</span>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">{texts.previewClaudeMd}</p>
              <Textarea value={previewSwarm?.claudeMd || texts.cardInitNone} readOnly rows={8} className="font-mono text-xs" />
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">{texts.previewAgentsMd}</p>
              <Textarea value={previewSwarm?.agentsMd || texts.cardInitNone} readOnly rows={6} className="font-mono text-xs" />
            </div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">{texts.previewInitializationAssets}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">{texts.previewFiles}</div>
                  <div className="space-y-1">
                    {(previewSwarm?.initPlan?.files || []).map((file) => (
                      <div key={file} className="truncate text-[11px] text-foreground">{file}</div>
                    ))}
                    {(previewSwarm?.initPlan?.files || []).length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">{texts.previewNoItems}</div>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">{texts.previewDirectories}</div>
                  <div className="space-y-1">
                    {(previewSwarm?.initPlan?.directories || []).map((dir) => (
                      <div key={dir} className="truncate text-[11px] text-foreground">{dir}</div>
                    ))}
                    {(previewSwarm?.initPlan?.directories || []).length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">{texts.previewNoItems}</div>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-md border border-border p-2 sm:col-span-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">{texts.previewSkillEntries}</div>
                  <div className="space-y-1">
                    {(previewSwarm?.initPlan?.skillEntries || []).map((entry) => (
                      <div key={entry} className="truncate text-[11px] text-foreground">{getSkillDisplayName(entry)}</div>
                    ))}
                    {(previewSwarm?.initPlan?.skillEntries || []).length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">{texts.previewNoItems}</div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-[11px] text-muted-foreground">{texts.previewTemplateSource}</div>
                <div className="mt-1 text-[11px] text-foreground">
                  {previewSwarm?.initPlan?.templateSource?.templateGitUrl || texts.previewNoTemplateSource}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {texts.previewTemplateBranch}: {previewSwarm?.initPlan?.templateSource?.templateBranch || texts.cardInitNone}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
