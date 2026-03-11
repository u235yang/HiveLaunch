'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { Button, Textarea } from '@shared/ui'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { BranchSelector } from '@/features/agent-execution/ui/BranchSelector'
import { LocalRepoPickerButton } from '@/features/kanban/ui/LocalRepoPickerButton'

interface ProjectBasicInfo {
  id: string
  name: string
  description?: string
  repoPath: string
  targetBranch: string
}

interface BasicInfoTabProps {
  projectId: string
  onDataLoaded?: (data: ProjectBasicInfo) => void
  texts?: BasicInfoTabTexts
}

interface BasicInfoTabTexts {
  requiredFieldsError: string
  fetchProjectFailed: string
  saveProjectFailed: string
  unknownError: string
  loading: string
  saveSuccess: string
  projectNameLabel: string
  projectNamePlaceholder: string
  projectNameHint: string
  projectDescriptionLabel: string
  projectDescriptionPlaceholder: string
  projectDescriptionHint: string
  repoPathLabel: string
  repoPathHint: string
  targetBranchLabel: string
  targetBranchHint: string
  branchNoWorkspace: string
  branchLoadFailed: string
  branchLocalBranches: string
  branchRemoteBranches: string
  branchRefreshBranches: string
  branchUnknown: string
  hasUnsavedChanges: string
  reset: string
  saving: string
  saveChanges: string
}

const defaultTexts: BasicInfoTabTexts = {
  requiredFieldsError: 'Project name, Git repository URL, and default target branch are required',
  fetchProjectFailed: 'Failed to fetch project',
  saveProjectFailed: 'Failed to save project',
  unknownError: 'Unknown error',
  loading: 'Loading...',
  saveSuccess: 'Saved successfully',
  projectNameLabel: 'Project Name',
  projectNamePlaceholder: 'Enter project name',
  projectNameHint: 'Display name shown in list and details',
  projectDescriptionLabel: 'Project Description',
  projectDescriptionPlaceholder: 'Briefly describe this project...',
  projectDescriptionHint: 'Optional description to clarify project purpose',
  repoPathLabel: 'Git Repository URL',
  repoPathHint: 'Enter a Git URL or pick a local directory via "Pick Local"',
  targetBranchLabel: 'Default Target Branch',
  targetBranchHint: 'Default branch for creating worktrees and running agents',
  branchNoWorkspace: 'No workspace',
  branchLoadFailed: 'Failed to load branches',
  branchLocalBranches: 'Local Branches',
  branchRemoteBranches: 'Remote Branches',
  branchRefreshBranches: 'Refresh branches',
  branchUnknown: 'unknown',
  hasUnsavedChanges: 'You have unsaved changes',
  reset: 'Reset',
  saving: 'Saving...',
  saveChanges: 'Save Changes',
}

export function BasicInfoTab({ projectId, onDataLoaded, texts = defaultTexts }: BasicInfoTabProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // 表单状态
  const [formData, setFormData] = useState<ProjectBasicInfo>({
    id: '',
    name: '',
    description: '',
    repoPath: '',
    targetBranch: '',
  })

  // 原始数据（用于检测变更和重置）
  const [originalData, setOriginalData] = useState<ProjectBasicInfo>({
    id: '',
    name: '',
    description: '',
    repoPath: '',
    targetBranch: '',
  })

  // 加载项目数据
  useEffect(() => {
    if (!projectId) return

    let active = true
    setIsLoading(true)
    setError(null)

    fetch(resolveHttpUrl(`/api/projects/${projectId}`))
      .then((response) => {
        if (!response.ok) throw new Error(texts.fetchProjectFailed)
        return response.json()
      })
      .then((data: ProjectBasicInfo) => {
        if (!active) return
        setFormData(data)
        setOriginalData(data)
        onDataLoaded?.(data)
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
  }, [projectId, onDataLoaded, texts.fetchProjectFailed, texts.unknownError])

  // 检测是否有未保存的更改
  const hasChanges =
    formData.name !== originalData.name ||
    formData.description !== originalData.description ||
    formData.repoPath !== originalData.repoPath ||
    formData.targetBranch !== originalData.targetBranch

  // 保存更改
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.repoPath.trim() || !formData.targetBranch.trim()) {
      setError(texts.requiredFieldsError)
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch(resolveHttpUrl(`/api/projects/${projectId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description?.trim() || null,
          repoPath: formData.repoPath.trim(),
          targetBranch: formData.targetBranch.trim(),
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || texts.saveProjectFailed)
      }

      const updated: ProjectBasicInfo = await response.json()
      setFormData(updated)
      setOriginalData(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : texts.unknownError)
    } finally {
      setIsSaving(false)
    }
  }

  // 重置更改
  const handleReset = () => {
    setFormData(originalData)
    setError(null)
    setSuccess(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">{texts.loading}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          {texts.saveSuccess}
        </div>
      )}

      {/* 项目名称 */}
      <div className="space-y-2">
        <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {texts.projectNameLabel} <span className="text-red-500">*</span>
        </label>
        <input
          id="project-name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={texts.projectNamePlaceholder}
          className="w-full h-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        />
        <p className="text-xs text-gray-500">{texts.projectNameHint}</p>
      </div>

      {/* 项目描述 */}
      <div className="space-y-2">
        <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {texts.projectDescriptionLabel}
        </label>
        <Textarea
          id="project-description"
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder={texts.projectDescriptionPlaceholder}
          rows={3}
          className="resize-none"
        />
        <p className="text-xs text-gray-500">{texts.projectDescriptionHint}</p>
      </div>

      {/* Git 仓库地址 */}
      <div className="space-y-2">
        <label htmlFor="repo-path" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {texts.repoPathLabel} <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-col gap-2">
          <input
            id="repo-path"
            type="text"
            value={formData.repoPath}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                repoPath: e.target.value,
                targetBranch: prev.repoPath.trim() === e.target.value.trim() ? prev.targetBranch : '',
              }))
            }
            placeholder="https://github.com/user/repo.git"
            className="w-full h-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          />
          <LocalRepoPickerButton
            selectedPath={formData.repoPath}
            onSelect={(path: string) =>
              setFormData((prev) => ({
                ...prev,
                repoPath: path,
                targetBranch: prev.repoPath.trim() === path.trim() ? prev.targetBranch : '',
              }))
            }
          />
        </div>
        <p className="text-xs text-gray-500">{texts.repoPathHint}</p>
      </div>

      {/* 默认目标分支 */}
      <div className="space-y-2">
        <label htmlFor="target-branch" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {texts.targetBranchLabel}
        </label>
        <BranchSelector
          worktreePath={formData.repoPath.trim() || null}
          currentBranch={formData.targetBranch || undefined}
          onChange={(branch) => setFormData((prev) => ({ ...prev, targetBranch: branch }))}
          className="w-full"
          texts={{
            noWorkspace: texts.branchNoWorkspace,
            loadFailed: texts.branchLoadFailed,
            localBranches: texts.branchLocalBranches,
            remoteBranches: texts.branchRemoteBranches,
            refreshBranches: texts.branchRefreshBranches,
            unknown: texts.branchUnknown,
          }}
        />
        <p className="text-xs text-gray-500">{texts.targetBranchHint}</p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-800">
        {hasChanges ? (
          <span className="text-sm text-amber-600">{texts.hasUnsavedChanges}</span>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isSaving || !hasChanges}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {texts.reset}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {texts.saving}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {texts.saveChanges}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
