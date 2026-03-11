'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { Button } from '@shared/ui'
import {
  GlobalSettings,
  getGlobalSettings,
  saveGlobalSettings,
  defaultSettings
} from '../lib/settings-api'

interface WorktreeSettingsTexts {
  loadError: string
  saveSuccess: string
  saveError: string
  loading: string
  title: string
  intro: string
  branchPrefixLabel: string
  branchPrefixHint: string
  workspaceDirLabel: string
  restoreDefaultTitle: string
  workspaceDirHint: string
  saving: string
  saveSettings: string
  previewTitle: string
  previewBranchPrefix: string
  previewWorkspaceDir: string
}

const defaultTexts: WorktreeSettingsTexts = {
  loadError: 'Failed to load settings',
  saveSuccess: 'Settings saved',
  saveError: 'Failed to save settings',
  loading: 'Loading...',
  title: 'Worktree Settings',
  intro: 'Worktree is an isolated workspace for Agent task execution. Each task runs in its own branch and directory and can be cleaned up after completion.',
  branchPrefixLabel: 'Branch Prefix',
  branchPrefixHint: 'Worktree branch prefix, default: hive-',
  workspaceDirLabel: 'Worktree Directory',
  restoreDefaultTitle: 'Restore default',
  workspaceDirHint: 'Leave empty to use default path: <repo>/.hive-worktrees/',
  saving: 'Saving...',
  saveSettings: 'Save Settings',
  previewTitle: 'Current Config Preview',
  previewBranchPrefix: 'Branch Prefix',
  previewWorkspaceDir: 'Worktree Directory',
}

interface WorktreeSettingsSectionProps {
  texts?: WorktreeSettingsTexts
}

export function WorktreeSettingsSection({ texts = defaultTexts }: WorktreeSettingsSectionProps) {
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const loaded = await getGlobalSettings()
        setSettings(loaded)
      } catch (error) {
        console.error(texts.loadError, error)
      } finally {
        setIsLoading(false)
      }
    }
    loadSettings()
  }, [texts.loadError])

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
      await saveGlobalSettings(settings)
      setMessage({ type: 'success', text: texts.saveSuccess })
    } catch (error) {
      console.error(texts.saveError, error)
      setMessage({ type: 'error', text: texts.saveError })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(defaultSettings)
    setMessage(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>{texts.loading}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-foreground">{texts.title}</h3>
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
          {texts.intro}
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-foreground">
            {texts.branchPrefixLabel}
          </label>
          <input
            type="text"
            value={settings.branch_prefix || ''}
            onChange={(e) => setSettings({ ...settings, branch_prefix: e.target.value })}
            placeholder="hive-"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {texts.branchPrefixHint}
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-foreground">
            {texts.workspaceDirLabel}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.workspace_dir || ''}
              onChange={(e) => setSettings({ ...settings, workspace_dir: e.target.value || null })}
              placeholder=""
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              title={texts.restoreDefaultTitle}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {texts.workspaceDirHint}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {texts.saving}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {texts.saveSettings}
              </>
            )}
          </Button>

          {message && (
            <span className={`text-sm ${
              message.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {message.text}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/60 p-4">
        <h4 className="mb-2 text-sm font-medium text-foreground">{texts.previewTitle}</h4>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{texts.previewBranchPrefix}: <code className="rounded bg-background px-1 text-foreground">{settings.branch_prefix || 'hive-'}</code></p>
          <p>{texts.previewWorkspaceDir}: <code className="rounded bg-background px-1 text-foreground">{settings.workspace_dir || '<repo>/.hive-worktrees/'}</code></p>
        </div>
      </div>
    </div>
  )
}
