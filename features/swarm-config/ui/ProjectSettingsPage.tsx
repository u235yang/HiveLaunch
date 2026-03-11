'use client'

import { useState } from 'react'
// @ts-expect-error TypeScript module resolution issue with next/navigation in monorepo
import { useRouter } from 'next/navigation'
import { ArrowLeft, Settings, Hexagon } from 'lucide-react'
import { Button } from '@shared/ui'
import { useProjectStore } from '@/features/shared/store'
import { useUIStore } from '@/features/shared/store/uiStore'
import { DEFAULT_LOCALE } from '@/i18n/config'
import zhMessages from '@/messages/zh-CN.json'
import enMessages from '@/messages/en-US.json'
import { BasicInfoTab } from './tabs/BasicInfoTab'
import { ProjectConfigEditorTab } from './tabs/ProjectConfigEditorTab'

type TabKey = 'basic' | 'swarm-config'

interface Tab {
  key: TabKey
  label: string
  icon: React.ReactNode
}

export function ProjectSettingsPage() {
  const router = useRouter()
  const locale = useUIStore((state) => state.locale)
  const [activeTab, setActiveTab] = useState<TabKey>('basic')
  const [projectName, setProjectName] = useState<string>('')
  const activeLocale = locale || DEFAULT_LOCALE
  const projectSettingsMessages =
    activeLocale === 'en-US' ? enMessages.projectSettings : zhMessages.projectSettings
  const t = (key: string): string =>
    key
      .split('.')
      .reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
          return (acc as Record<string, unknown>)[part]
        }
        return key
      }, projectSettingsMessages) as string
  const tabs: Tab[] = [
    { key: 'basic', label: t('tabs.basic'), icon: <Settings className="w-4 h-4" /> },
    { key: 'swarm-config', label: t('tabs.swarmConfig'), icon: <Hexagon className="w-4 h-4" /> },
  ]
  const basicInfoTexts = {
    requiredFieldsError: t('basicInfo.requiredFieldsError'),
    fetchProjectFailed: t('basicInfo.fetchProjectFailed'),
    saveProjectFailed: t('basicInfo.saveProjectFailed'),
    unknownError: t('basicInfo.unknownError'),
    loading: t('basicInfo.loading'),
    saveSuccess: t('basicInfo.saveSuccess'),
    projectNameLabel: t('basicInfo.projectNameLabel'),
    projectNamePlaceholder: t('basicInfo.projectNamePlaceholder'),
    projectNameHint: t('basicInfo.projectNameHint'),
    projectDescriptionLabel: t('basicInfo.projectDescriptionLabel'),
    projectDescriptionPlaceholder: t('basicInfo.projectDescriptionPlaceholder'),
    projectDescriptionHint: t('basicInfo.projectDescriptionHint'),
    repoPathLabel: t('basicInfo.repoPathLabel'),
    repoPathHint: t('basicInfo.repoPathHint'),
    targetBranchLabel: t('basicInfo.targetBranchLabel'),
    targetBranchHint: t('basicInfo.targetBranchHint'),
    branchNoWorkspace: t('basicInfo.branchNoWorkspace'),
    branchLoadFailed: t('basicInfo.branchLoadFailed'),
    branchLocalBranches: t('basicInfo.branchLocalBranches'),
    branchRemoteBranches: t('basicInfo.branchRemoteBranches'),
    branchRefreshBranches: t('basicInfo.branchRefreshBranches'),
    branchUnknown: t('basicInfo.branchUnknown'),
    hasUnsavedChanges: t('basicInfo.hasUnsavedChanges'),
    reset: t('basicInfo.reset'),
    saving: t('basicInfo.saving'),
    saveChanges: t('basicInfo.saveChanges'),
  }
  const configEditorTexts = {
    noSwarmBound: t('configEditor.noSwarmBound'),
    description: t('configEditor.description'),
    save: t('configEditor.save'),
    saving: t('configEditor.saving'),
    saved: t('configEditor.saved'),
    loadingSwarms: t('configEditor.loadingSwarms'),
    swarmGroupOfficial: t('configEditor.swarmGroupOfficial'),
    swarmGroupCustom: t('configEditor.swarmGroupCustom'),
    noSwarms: t('configEditor.noSwarms'),
    swarmNoDescription: t('configEditor.swarmNoDescription'),
    swarmCapabilities: t('configEditor.swarmCapabilities'),
    capabilityHint: t('configEditor.capabilityHint'),
    capabilityAgentConfig: t('configEditor.capabilityAgentConfig'),
    capabilitySkills: t('configEditor.capabilitySkills'),
    capabilityRules: t('configEditor.capabilityRules'),
    capabilityTemplate: t('configEditor.capabilityTemplate'),
    capabilityTemplateSwitch: t('configEditor.capabilityTemplateSwitch'),
    capabilityTemplateRepo: t('configEditor.capabilityTemplateRepo'),
    capabilityTemplateBranch: t('configEditor.capabilityTemplateBranch'),
    capabilityTemplateRepoPlaceholder: t('configEditor.capabilityTemplateRepoPlaceholder'),
    capabilityTemplateBranchPlaceholder: t('configEditor.capabilityTemplateBranchPlaceholder'),
    capabilityAgentConfigOhMy: t('configEditor.capabilityAgentConfigOhMy'),
    capabilityAgentConfigOpencode: t('configEditor.capabilityAgentConfigOpencode'),
    capabilityRulesClaude: t('configEditor.capabilityRulesClaude'),
    capabilityRulesAgents: t('configEditor.capabilityRulesAgents'),
    effectivePlanTitle: t('configEditor.effectivePlanTitle'),
    effectivePlanHint: t('configEditor.effectivePlanHint'),
    effectivePlanWillWriteFiles: t('configEditor.effectivePlanWillWriteFiles'),
    effectivePlanWillCreateDirs: t('configEditor.effectivePlanWillCreateDirs'),
    effectivePlanWillSyncSkills: t('configEditor.effectivePlanWillSyncSkills'),
    effectivePlanTemplateSource: t('configEditor.effectivePlanTemplateSource'),
    effectivePlanDisabled: t('configEditor.effectivePlanDisabled'),
    effectivePlanNone: t('configEditor.effectivePlanNone'),
    effectivePlanMoreItems: t('configEditor.effectivePlanMoreItems'),
    effectivePlanTemplateUnsupported: t('configEditor.effectivePlanTemplateUnsupported'),
    skillsHubCheckFailed: t('configEditor.skillsHubCheckFailed'),
    missingSkillsTitle: t('configEditor.missingSkillsTitle'),
    missingSkillsHint: t('configEditor.missingSkillsHint'),
    missingSkillsGoSettings: t('configEditor.missingSkillsGoSettings'),
    missingSkillsBeforeApply: t('configEditor.missingSkillsBeforeApply'),
    missingSkillsAndMore: t('configEditor.missingSkillsAndMore'),
    skillsHubChecking: t('configEditor.skillsHubChecking'),
    skillsHubReadyPrefix: t('configEditor.skillsHubReadyPrefix'),
    addSkills: t('configEditor.addSkills'),
    refreshHubSkills: t('configEditor.refreshHubSkills'),
    templateSkillsCountLabel: t('configEditor.templateSkillsCountLabel'),
    projectSkillsCountLabel: t('configEditor.projectSkillsCountLabel'),
    hubSkillsCountLabel: t('configEditor.hubSkillsCountLabel'),
    selectedProjectSkillsTitle: t('configEditor.selectedProjectSkillsTitle'),
    noSelectedProjectSkills: t('configEditor.noSelectedProjectSkills'),
    noHubSkills: t('configEditor.noHubSkills'),
    addSelectedFromHub: t('configEditor.addSelectedFromHub'),
    noHubSkillsSelected: t('configEditor.noHubSkillsSelected'),
    templateSkillTag: t('configEditor.templateSkillTag'),
    applyFailed: t('configEditor.applyFailed'),
    loadFailed: t('configEditor.loadFailed'),
    selectSwarmFirst: t('configEditor.selectSwarmFirst'),
  }

  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const handleGoBack = () => {
    router.back()
  }

  const handleDataLoaded = (data: { name: string }) => {
    setProjectName(data.name)
  }

  return (
    <div className="flex flex-col h-full bg-[#f8f7f5] dark:bg-[#1c1917]">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('back')}
            </Button>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {t('title')}
              {projectName && (
                <span className="text-gray-400 dark:text-gray-500 font-normal ml-2">
                  · {projectName}
                </span>
              )}
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg mb-6 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            {projectId ? (
              <>
                {activeTab === 'basic' && (
                  <BasicInfoTab
                    projectId={projectId}
                    onDataLoaded={handleDataLoaded}
                    texts={basicInfoTexts}
                  />
                )}
                {activeTab === 'swarm-config' && (
                  <div className="space-y-6">
                    <ProjectConfigEditorTab projectId={projectId} texts={configEditorTexts} />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                {t('emptyProject')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
