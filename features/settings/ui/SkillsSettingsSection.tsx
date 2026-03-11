'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Download, Loader2, RefreshCw, Search, Trash2, Wrench } from 'lucide-react'
import { Button } from '@shared/ui'
import { getGlobalSettings, saveGlobalSettings } from '../lib/settings-api'
import {
  findSkills,
  getSkillsHubStatus,
  installSkill,
  listSkillsFromRepo,
  removeSkill,
  updateSkills,
  type SearchSkillResult,
  type SkillsCommandResult,
  type SkillsHubStatus,
} from '../lib/skills-api'

type MessageState = { type: 'success' | 'error'; text: string } | null

const DEFAULT_REPO = 'vercel-labs/agent-skills'
const DEFAULT_AGENT = 'opencode'
const DEFAULT_HUB_DIR = '~/.hivelaunch/skills-hub'
const SEARCH_LIMIT = 20

interface SkillsSettingsTexts {
  searchInstallCountSuffix: string
  emptyCandidatesTitle: string
  loadSettingsError: string
  commandFailed: string
  saveHubDirSuccess: string
  saveHubDirError: string
  searchKeywordRequired: string
  searchFailed: string
  searchResultTitle: string
  searchResultEmpty: string
  foundSkillCountPrefix: string
  foundSkillCountSuffix: string
  repoRequired: string
  repoListLoaded: string
  repoListTitle: string
  repoListEmpty: string
  skillNameRequired: string
  installSuccessPrefix: string
  skillsUpdated: string
  smartInputRequired: string
  loading: string
  hubTitle: string
  hubDirLabel: string
  hubDirDefaultLabel: string
  editPath: string
  cancelEdit: string
  useDefault: string
  save: string
  dirStatus: string
  dirExists: string
  dirNotCreated: string
  lockFile: string
  exists: string
  notExists: string
  installedCount: string
  workstationTitle: string
  smartInputPlaceholder: string
  smartInputHelp: string
  execute: string
  repoLabel: string
  repoHelp: string
  skillLabel: string
  skillHelp: string
  skillsShGuideTitle: string
  skillsShGuideDescription: string
  skillsShGuideLinkText: string
  searchInstall: string
  browseRepo: string
  installDirectly: string
  updateInstalled: string
  candidateHint: string
  installedTag: string
  select: string
  install: string
  installedSkillsTitle: string
  noInstalledSkills: string
  removeSuccessPrefix: string
}

const defaultTexts: SkillsSettingsTexts = {
  searchInstallCountSuffix: ' installs',
  emptyCandidatesTitle: 'No candidate results',
  loadSettingsError: 'Failed to load skills settings',
  commandFailed: 'Command execution failed',
  saveHubDirSuccess: 'Skills hub path saved',
  saveHubDirError: 'Failed to save skills hub path',
  searchKeywordRequired: 'Please enter a keyword before searching',
  searchFailed: 'Search failed',
  searchResultTitle: 'Search results',
  searchResultEmpty: 'No search results',
  foundSkillCountPrefix: 'Found ',
  foundSkillCountSuffix: ' skills',
  repoRequired: 'Please enter the skills repo first',
  repoListLoaded: 'Repository skills loaded',
  repoListTitle: 'Repository skills',
  repoListEmpty: 'Repository skills list is empty',
  skillNameRequired: 'Please input or select a skill name first',
  installSuccessPrefix: 'Installed ',
  skillsUpdated: 'Skills updated',
  smartInputRequired: 'Enter keyword, repository, or owner/repo@skill',
  loading: 'Loading skills settings...',
  hubTitle: 'Skills Hub',
  hubDirLabel: 'Skills Hub Path',
  hubDirDefaultLabel: 'Default path',
  editPath: 'Edit',
  cancelEdit: 'Cancel',
  useDefault: 'Use Default',
  save: 'Save',
  dirStatus: 'Directory status',
  dirExists: 'Exists',
  dirNotCreated: 'Not created',
  lockFile: 'Lock file',
  exists: 'Exists',
  notExists: 'Not exists',
  installedCount: 'Installed skills',
  workstationTitle: 'Skills Install Workspace',
  smartInputPlaceholder: 'Enter keyword, repo, or owner/repo@skill',
  smartInputHelp: 'Enter a keyword to search, or owner/repo, or owner/repo@skill for quick install',
  execute: 'Run',
  repoLabel: 'Repository',
  repoHelp: 'Use owner/repo format, for example vercel-labs/agent-skills',
  skillLabel: 'Skill Name',
  skillHelp: 'Fill the exact skill name from repository list or skills.sh search results',
  skillsShGuideTitle: 'Need help finding repository and skill names?',
  skillsShGuideDescription: 'This panel wraps skills.sh. Open the official site to find repos and skill names.',
  skillsShGuideLinkText: 'Open skills.sh',
  searchInstall: 'Search & Install',
  browseRepo: 'Browse Repo',
  installDirectly: 'Install Directly',
  updateInstalled: 'Update Installed',
  candidateHint: 'Generate skill candidates via Search & Install or Browse Repo',
  installedTag: 'Installed',
  select: 'Select',
  install: 'Install',
  installedSkillsTitle: 'Installed Skills',
  noInstalledSkills: 'No installed skills',
  removeSuccessPrefix: 'Removed ',
}

interface SkillCandidate {
  repo: string
  skill: string
  note?: string
  source: 'search' | 'repo-list'
  installs?: number
}

function toLines(value: string): string[] {
  const sanitized = value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
    .replace(/\u001b\[\?25[hl]/g, '')
  return sanitized
    .split('\n')
    .map((line) => line.replace(/[│◇◆●■◐◑◒◓]/g, '').trim())
    .filter(Boolean)
}

function parseRepoSkillInput(value: string): { repo: string; skill: string } | null {
  const trimmed = value.trim()
  const match = trimmed.match(/^([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)@([^\s]+)$/)
  if (!match) return null
  return { repo: match[1], skill: match[2] }
}

function looksLikeRepo(value: string): boolean {
  const trimmed = value.trim()
  return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmed)
}

function convertSearchResults(results: SearchSkillResult[], installCountSuffix: string): SkillCandidate[] {
  return results.map((r) => ({
    repo: `${r.owner}/${r.repo}`,
    skill: r.skill,
    note: `${r.installs.toLocaleString()}${installCountSuffix}`,
    source: 'search' as const,
    installs: r.installs,
  }))
}

function parseRepoListCandidates(lines: string[], repo: string): SkillCandidate[] {
  const dedupe = new Set<string>()
  const candidates: SkillCandidate[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (
      trimmed.startsWith('█') ||
      trimmed.startsWith('┌') ||
      trimmed.startsWith('└') ||
      trimmed.startsWith('│') ||
      trimmed.startsWith('◇') ||
      trimmed.startsWith('◆') ||
      trimmed.startsWith('●') ||
      trimmed.toLowerCase().startsWith('source:') ||
      trimmed.toLowerCase().startsWith('found ') ||
      trimmed.toLowerCase().startsWith('available skills') ||
      trimmed.toLowerCase().startsWith('use --skill')
    ) {
      continue
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(trimmed)) continue
    const key = `${repo}::${trimmed}`.toLowerCase()
    if (dedupe.has(key)) continue
    dedupe.add(key)
    candidates.push({
      repo,
      skill: trimmed,
      source: 'repo-list',
    })
  }
  return candidates
}

interface SkillsSettingsSectionProps {
  texts?: SkillsSettingsTexts
}

export function SkillsSettingsSection({ texts = defaultTexts }: SkillsSettingsSectionProps) {
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<MessageState>(null)

  const [hubDir, setHubDir] = useState('')
  const [hasCustomHubDir, setHasCustomHubDir] = useState(false)
  const [editingHubDir, setEditingHubDir] = useState(false)
  const [status, setStatus] = useState<SkillsHubStatus | null>(null)
  const [smartInput, setSmartInput] = useState('')
  const [repo, setRepo] = useState(DEFAULT_REPO)
  const [selectedSkill, setSelectedSkill] = useState('')
  const [candidates, setCandidates] = useState<SkillCandidate[]>([])
  const [resultTitle, setResultTitle] = useState(texts.emptyCandidatesTitle)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, hubStatus] = await Promise.all([
        getGlobalSettings(),
        getSkillsHubStatus(),
      ])
      const customHubDir = settings.skills_hub_dir?.trim() ?? ''
      setHubDir(customHubDir)
      setHasCustomHubDir(Boolean(customHubDir))
      setEditingHubDir(false)
      setStatus(hubStatus)
      setMessage(null)
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.loadSettingsError
      setMessage({ type: 'error', text })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const runCommand = useCallback(
    async (
      action: () => Promise<SkillsCommandResult>,
      options: { successText?: string; refresh?: boolean } = {}
    ) => {
      const { successText, refresh = false } = options
      setPending(true)
      setMessage(null)
      try {
        const result = await action()
        if (!result.success) {
          throw new Error(result.stderr || result.stdout || texts.commandFailed)
        }
        if (successText) {
          setMessage({ type: 'success', text: successText })
        }
        if (refresh) {
          await loadData()
        }
        return result
      } catch (error) {
        const text = error instanceof Error ? error.message : texts.commandFailed
        setMessage({ type: 'error', text })
        return null
      } finally {
        setPending(false)
      }
    },
    [loadData]
  )

  const handleSaveHubDir = useCallback(async () => {
    setPending(true)
    setMessage(null)
    try {
      const settings = await getGlobalSettings()
      const nextHubDir = hubDir.trim()
      await saveGlobalSettings({
        ...settings,
        skills_hub_dir: nextHubDir || null,
      })
      setHasCustomHubDir(Boolean(nextHubDir))
      setEditingHubDir(false)
      setMessage({ type: 'success', text: texts.saveHubDirSuccess })
      await loadData()
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.saveHubDirError
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }, [hubDir, loadData])

  const handleUseDefaultHubDir = useCallback(async () => {
    setPending(true)
    setMessage(null)
    try {
      const settings = await getGlobalSettings()
      await saveGlobalSettings({
        ...settings,
        skills_hub_dir: null,
      })
      setHubDir('')
      setHasCustomHubDir(false)
      setEditingHubDir(false)
      setMessage({ type: 'success', text: texts.saveHubDirSuccess })
      await loadData()
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.saveHubDirError
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }, [loadData])

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) {
        setMessage({ type: 'error', text: texts.searchKeywordRequired })
        return
      }
      setPending(true)
      setMessage(null)
      try {
        const result = await findSkills(trimmed, SEARCH_LIMIT)
        if (!result.success) {
          throw new Error(result.error || texts.searchFailed)
        }
        const parsed = convertSearchResults(result.results, texts.searchInstallCountSuffix)
        setCandidates(parsed)
        setResultTitle(parsed.length > 0 ? `${texts.searchResultTitle} (${parsed.length})` : texts.searchResultEmpty)
        setMessage({ type: 'success', text: `${texts.foundSkillCountPrefix}${parsed.length}${texts.foundSkillCountSuffix}` })
      } catch (error) {
        const text = error instanceof Error ? error.message : texts.searchFailed
        setMessage({ type: 'error', text })
      } finally {
        setPending(false)
      }
    },
    []
  )

  const handleRepoList = useCallback(
    async (repoValue: string) => {
      const trimmed = repoValue.trim()
      if (!trimmed) {
        setMessage({ type: 'error', text: texts.repoRequired })
        return
      }
      const result = await runCommand(() => listSkillsFromRepo(trimmed), { successText: texts.repoListLoaded })
      if (!result) return
      const lines = toLines(result.stdout)
      const parsed = parseRepoListCandidates(lines, trimmed)
      setCandidates(parsed)
      setResultTitle(parsed.length > 0 ? `${texts.repoListTitle} (${parsed.length})` : texts.repoListEmpty)
    },
    [runCommand]
  )

  const handleInstall = useCallback(async (targetRepo?: string, targetSkill?: string) => {
    const finalRepo = (targetRepo ?? repo).trim()
    const finalSkill = (targetSkill ?? selectedSkill).trim()
    if (!finalRepo) {
      setMessage({ type: 'error', text: texts.repoRequired })
      return
    }
    if (!finalSkill) {
      setMessage({ type: 'error', text: texts.skillNameRequired })
      return
    }
    await runCommand(
      () => installSkill(finalRepo, finalSkill, DEFAULT_AGENT),
      { successText: `${texts.installSuccessPrefix}${finalSkill}`, refresh: true }
    )
  }, [repo, runCommand, selectedSkill])

  const handleUpdate = useCallback(async () => {
    await runCommand(
      () => updateSkills(),
      { successText: texts.skillsUpdated, refresh: true }
    )
  }, [runCommand])

  const handleSmartSubmit = useCallback(async () => {
    const value = smartInput.trim()
    if (!value) {
      setMessage({ type: 'error', text: texts.smartInputRequired })
      return
    }
    const full = parseRepoSkillInput(value)
    if (full) {
      setRepo(full.repo)
      setSelectedSkill(full.skill)
      await handleInstall(full.repo, full.skill)
      return
    }
    if (looksLikeRepo(value)) {
      setRepo(value)
      await handleRepoList(value)
      return
    }
    await handleSearch(value)
  }, [handleRepoList, handleSearch, smartInput])

  const handleSmartFormSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleSmartSubmit()
  }, [handleSmartSubmit])

  const installedSkills = useMemo(() => status?.installed_skills ?? [], [status])
  const installedSet = useMemo(
    () => new Set(installedSkills.map((skill) => skill.name.toLowerCase())),
    [installedSkills]
  )
  const displayHubDir = editingHubDir ? hubDir : hasCustomHubDir ? hubDir : DEFAULT_HUB_DIR

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {texts.loading}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <div className="mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">{texts.hubTitle}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-sm font-medium">{texts.hubDirLabel}</label>
            <div className="flex gap-2">
              <input
                value={displayHubDir}
                onChange={(e) => setHubDir(e.target.value)}
                disabled={!editingHubDir}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                placeholder={DEFAULT_HUB_DIR}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (editingHubDir) {
                    void loadData()
                    return
                  }
                  setEditingHubDir(true)
                }}
                disabled={pending}
              >
                {editingHubDir ? texts.cancelEdit : texts.editPath}
              </Button>
              <Button onClick={() => void handleSaveHubDir()} disabled={pending || !editingHubDir}>
                {texts.save}
              </Button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{texts.hubDirDefaultLabel}: {DEFAULT_HUB_DIR}</span>
              {hasCustomHubDir && !editingHubDir && (
                <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-xs" onClick={() => void handleUseDefaultHubDir()} disabled={pending}>
                  {texts.useDefault}
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-1 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <div>{texts.dirStatus}: {status?.exists ? texts.dirExists : texts.dirNotCreated}</div>
            <div>{texts.lockFile}: {status?.lock_file_exists ? texts.exists : texts.notExists}</div>
            <div>{texts.installedCount}: {installedSkills.length}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h3 className="mb-4 text-base font-semibold">{texts.workstationTitle}</h3>
        <form className="space-y-3" onSubmit={handleSmartFormSubmit}>
          <div className="flex gap-2">
            <input
              value={smartInput}
              onChange={(e) => setSmartInput(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              placeholder={texts.smartInputPlaceholder}
            />
            <Button type="submit" disabled={pending || !smartInput.trim()}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {texts.execute}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{texts.smartInputHelp}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">{texts.repoLabel}</label>
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                placeholder={DEFAULT_REPO}
              />
              <p className="mt-1 text-xs text-muted-foreground">{texts.repoHelp}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{texts.skillLabel}</label>
              <input
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                placeholder="vercel-react-best-practices"
              />
              <p className="mt-1 text-xs text-muted-foreground">{texts.skillHelp}</p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted p-3 text-xs text-foreground">
            <div className="font-medium">{texts.skillsShGuideTitle}</div>
            <div className="mt-1">{texts.skillsShGuideDescription}</div>
            <a
              href="https://skills.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-primary underline"
            >
              {texts.skillsShGuideLinkText}
            </a>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleSearch(smartInput)} disabled={pending || !smartInput.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {texts.searchInstall}
          </Button>
          <Button variant="outline" onClick={() => void handleRepoList(repo)} disabled={pending || !repo.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {texts.browseRepo}
          </Button>
          <Button onClick={() => void handleInstall()} disabled={pending || !repo.trim() || !selectedSkill.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {texts.installDirectly}
          </Button>
          <Button variant="outline" onClick={() => void handleUpdate()} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {texts.updateInstalled}
          </Button>
        </div>
          <div className="mt-3 rounded-md bg-muted p-3">
          <div className="mb-2 text-sm font-medium text-foreground">{resultTitle}</div>
          {candidates.length === 0 ? (
            <div className="text-sm text-muted-foreground">{texts.candidateHint}</div>
          ) : (
            <div className="space-y-2">
              {candidates.map((candidate) => {
                const installed = installedSet.has(candidate.skill.toLowerCase())
                return (
                  <div key={`${candidate.repo}:${candidate.skill}`} className="rounded-md border border-border bg-card p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{candidate.skill}</div>
                        <div className="truncate text-xs text-muted-foreground">{candidate.repo}</div>
                        {candidate.note && <div className="mt-1 text-xs text-muted-foreground">{candidate.note}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {installed && (
                          <span className="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
                            {texts.installedTag}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setRepo(candidate.repo)
                            setSelectedSkill(candidate.skill)
                          }}
                        >
                          {texts.select}
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending || installed}
                          onClick={() => void handleInstall(candidate.repo, candidate.skill)}
                        >
                          {texts.install}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h3 className="mb-4 text-base font-semibold">{texts.installedSkillsTitle}</h3>
        {installedSkills.length === 0 ? (
          <div className="text-sm text-muted-foreground">{texts.noInstalledSkills}</div>
        ) : (
          <div className="space-y-2">
            {installedSkills.map((skill) => (
              <div key={skill.name} className="flex items-center justify-between rounded-md border border-border p-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{skill.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{skill.path}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void runCommand(
                      () => removeSkill(skill.name),
                      { successText: `${texts.removeSuccessPrefix}${skill.name}`, refresh: true }
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
