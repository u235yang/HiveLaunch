'use client'

import { useEffect, useState } from 'react'
import { GitBranch, Settings as SettingsIcon, Info, ShieldCheck, Wrench, Sun, Moon, Monitor, Globe, Star, ExternalLink } from 'lucide-react'
import { WorktreeSettingsSection } from './WorktreeSettingsSection'
import { RemoteAccessSection } from './RemoteAccessSection'
import { SkillsSettingsSection } from './SkillsSettingsSection'
import { SwarmListPage } from '@/features/swarm-config/ui/SwarmListPage'
import { useUIStore, type ThemeMode } from '@/features/shared/store'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, type AppLocale } from '@/i18n/config'
import zhMessages from '@/messages/zh-CN.json'
import enMessages from '@/messages/en-US.json'
import { Tabs, TabsList, TabsTrigger } from '@shared/ui'
import { useMobile } from '@/hooks/use-mobile'

type SettingsTab = 'general' | 'git' | 'remote' | 'agents' | 'skills' | 'about'

/**
 * 设置页面
 * 包含通用设置、Worktree 设置、Agent 配置等
 */
export function SettingsPage() {
  const locale = useUIStore((state) => state.locale)
  const setLocale = useUIStore((state) => state.setLocale)
  const themeMode = useUIStore((state) => state.themeMode)
  const setThemeMode = useUIStore((state) => state.setThemeMode)
  const [activeTab, setActiveTab] = useState<SettingsTab>('git')
  const isMobile = useMobile()
  const activeLocale = locale || DEFAULT_LOCALE
  const settingsMessages = activeLocale === 'en-US' ? enMessages.settings : zhMessages.settings
  const t = (key: string): string =>
    key
      .split('.')
      .reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
          return (acc as Record<string, unknown>)[part]
        }
        return key
      }, settingsMessages) as string

  const tabs = [
    { id: 'general' as const, label: t('tabs.general'), icon: SettingsIcon },
    { id: 'git' as const, label: t('tabs.git'), icon: GitBranch },
    { id: 'remote' as const, label: t('tabs.remote'), icon: ShieldCheck },
    { id: 'agents' as const, label: t('tabs.agents'), icon: SettingsIcon },
    { id: 'skills' as const, label: t('tabs.skills'), icon: Wrench },
    { id: 'about' as const, label: t('tabs.about'), icon: Info },
  ]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    if (tabParam === 'general' || tabParam === 'git' || tabParam === 'remote' || tabParam === 'agents' || tabParam === 'skills' || tabParam === 'about') {
      setActiveTab(tabParam)
    }
  }, [])
  const worktreeTexts = {
    loadError: t('worktreeSection.loadError'),
    saveSuccess: t('worktreeSection.saveSuccess'),
    saveError: t('worktreeSection.saveError'),
    loading: t('worktreeSection.loading'),
    title: t('worktreeSection.title'),
    intro: t('worktreeSection.intro'),
    branchPrefixLabel: t('worktreeSection.branchPrefixLabel'),
    branchPrefixHint: t('worktreeSection.branchPrefixHint'),
    workspaceDirLabel: t('worktreeSection.workspaceDirLabel'),
    restoreDefaultTitle: t('worktreeSection.restoreDefaultTitle'),
    workspaceDirHint: t('worktreeSection.workspaceDirHint'),
    saving: t('worktreeSection.saving'),
    saveSettings: t('worktreeSection.saveSettings'),
    previewTitle: t('worktreeSection.previewTitle'),
    previewBranchPrefix: t('worktreeSection.previewBranchPrefix'),
    previewWorkspaceDir: t('worktreeSection.previewWorkspaceDir'),
  }
  const skillsTexts = {
    searchInstallCountSuffix: t('skillsSection.searchInstallCountSuffix'),
    emptyCandidatesTitle: t('skillsSection.emptyCandidatesTitle'),
    loadSettingsError: t('skillsSection.loadSettingsError'),
    commandFailed: t('skillsSection.commandFailed'),
    saveHubDirSuccess: t('skillsSection.saveHubDirSuccess'),
    saveHubDirError: t('skillsSection.saveHubDirError'),
    searchKeywordRequired: t('skillsSection.searchKeywordRequired'),
    searchFailed: t('skillsSection.searchFailed'),
    searchResultTitle: t('skillsSection.searchResultTitle'),
    searchResultEmpty: t('skillsSection.searchResultEmpty'),
    foundSkillCountPrefix: t('skillsSection.foundSkillCountPrefix'),
    foundSkillCountSuffix: t('skillsSection.foundSkillCountSuffix'),
    repoRequired: t('skillsSection.repoRequired'),
    repoListLoaded: t('skillsSection.repoListLoaded'),
    repoListTitle: t('skillsSection.repoListTitle'),
    repoListEmpty: t('skillsSection.repoListEmpty'),
    skillNameRequired: t('skillsSection.skillNameRequired'),
    installSuccessPrefix: t('skillsSection.installSuccessPrefix'),
    skillsUpdated: t('skillsSection.skillsUpdated'),
    smartInputRequired: t('skillsSection.smartInputRequired'),
    loading: t('skillsSection.loading'),
    hubTitle: t('skillsSection.hubTitle'),
    hubDirLabel: t('skillsSection.hubDirLabel'),
    hubDirDefaultLabel: t('skillsSection.hubDirDefaultLabel'),
    editPath: t('skillsSection.editPath'),
    cancelEdit: t('skillsSection.cancelEdit'),
    useDefault: t('skillsSection.useDefault'),
    save: t('skillsSection.save'),
    dirStatus: t('skillsSection.dirStatus'),
    dirExists: t('skillsSection.dirExists'),
    dirNotCreated: t('skillsSection.dirNotCreated'),
    lockFile: t('skillsSection.lockFile'),
    exists: t('skillsSection.exists'),
    notExists: t('skillsSection.notExists'),
    installedCount: t('skillsSection.installedCount'),
    workstationTitle: t('skillsSection.workstationTitle'),
    smartInputPlaceholder: t('skillsSection.smartInputPlaceholder'),
    smartInputHelp: t('skillsSection.smartInputHelp'),
    execute: t('skillsSection.execute'),
    repoLabel: t('skillsSection.repoLabel'),
    repoHelp: t('skillsSection.repoHelp'),
    skillLabel: t('skillsSection.skillLabel'),
    skillHelp: t('skillsSection.skillHelp'),
    skillsShGuideTitle: t('skillsSection.skillsShGuideTitle'),
    skillsShGuideDescription: t('skillsSection.skillsShGuideDescription'),
    skillsShGuideLinkText: t('skillsSection.skillsShGuideLinkText'),
    searchInstall: t('skillsSection.searchInstall'),
    browseRepo: t('skillsSection.browseRepo'),
    installDirectly: t('skillsSection.installDirectly'),
    updateInstalled: t('skillsSection.updateInstalled'),
    candidateHint: t('skillsSection.candidateHint'),
    installedTag: t('skillsSection.installedTag'),
    select: t('skillsSection.select'),
    install: t('skillsSection.install'),
    installedSkillsTitle: t('skillsSection.installedSkillsTitle'),
    noInstalledSkills: t('skillsSection.noInstalledSkills'),
    removeSuccessPrefix: t('skillsSection.removeSuccessPrefix'),
  }
  const remoteTexts = {
    statusConnected: t('remoteSection.statusConnected'),
    statusConnecting: t('remoteSection.statusConnecting'),
    statusReconnecting: t('remoteSection.statusReconnecting'),
    statusDisabled: t('remoteSection.statusDisabled'),
    loadStatusError: t('remoteSection.loadStatusError'),
    enabledSuccess: t('remoteSection.enabledSuccess'),
    enableFailed: t('remoteSection.enableFailed'),
    disabledSuccess: t('remoteSection.disabledSuccess'),
    disableFailed: t('remoteSection.disableFailed'),
    regenerateSuccess: t('remoteSection.regenerateSuccess'),
    regenerateFailed: t('remoteSection.regenerateFailed'),
    desktopTestDisabled: t('remoteSection.desktopTestDisabled'),
    desktopTestSuccess: t('remoteSection.desktopTestSuccess'),
    desktopTestNotReadyPrefix: t('remoteSection.desktopTestNotReadyPrefix'),
    desktopTestFailed: t('remoteSection.desktopTestFailed'),
    removePairSuccess: t('remoteSection.removePairSuccess'),
    removePairFailed: t('remoteSection.removePairFailed'),
    invalidQrContent: t('remoteSection.invalidQrContent'),
    scanRequireSecureContext: t('remoteSection.scanRequireSecureContext'),
    scanNotSupported: t('remoteSection.scanNotSupported'),
    cameraInitFailed: t('remoteSection.cameraInitFailed'),
    scanFailed: t('remoteSection.scanFailed'),
    cameraPermissionDenied: t('remoteSection.cameraPermissionDenied'),
    cameraNotFound: t('remoteSection.cameraNotFound'),
    cameraUnavailable: t('remoteSection.cameraUnavailable'),
    connectRelayFailed: t('remoteSection.connectRelayFailed'),
    tunnelTestFailedNoSession: t('remoteSection.tunnelTestFailedNoSession'),
    tunnelTestFailedNeedConnect: t('remoteSection.tunnelTestFailedNeedConnect'),
    tunnelTestSuccess: t('remoteSection.tunnelTestSuccess'),
    tunnelTestFailedHttpPrefix: t('remoteSection.tunnelTestFailedHttpPrefix'),
    tunnelTestFailedNoResponse: t('remoteSection.tunnelTestFailedNoResponse'),
    directAddressRequired: t('remoteSection.directAddressRequired'),
    directTestFailedPrefix: t('remoteSection.directTestFailedPrefix'),
    directTestSuccess: t('remoteSection.directTestSuccess'),
    directTestFailedNetwork: t('remoteSection.directTestFailedNetwork'),
    directAppliedPrefix: t('remoteSection.directAppliedPrefix'),
    loading: t('remoteSection.loading'),
    desktopTitle: t('remoteSection.desktopTitle'),
    notEnabled: t('remoteSection.notEnabled'),
    relayUrlLabel: t('remoteSection.relayUrlLabel'),
    desktopDeviceNameLabel: t('remoteSection.desktopDeviceNameLabel'),
    closeRemote: t('remoteSection.closeRemote'),
    openRemote: t('remoteSection.openRemote'),
    testRemote: t('remoteSection.testRemote'),
    resetKey: t('remoteSection.resetKey'),
    deviceIdLabel: t('remoteSection.deviceIdLabel'),
    pairingKeyLabel: t('remoteSection.pairingKeyLabel'),
    lastErrorLabel: t('remoteSection.lastErrorLabel'),
    mobileScanConnect: t('remoteSection.mobileScanConnect'),
    copyQrContent: t('remoteSection.copyQrContent'),
    pairedDevicesTitle: t('remoteSection.pairedDevicesTitle'),
    noPairedDevices: t('remoteSection.noPairedDevices'),
    cancelPairing: t('remoteSection.cancelPairing'),
    mobilePairTitle: t('remoteSection.mobilePairTitle'),
    modeDirect: t('remoteSection.modeDirect'),
    modeTunnelConnected: t('remoteSection.modeTunnelConnected'),
    modeTunnelDisconnected: t('remoteSection.modeTunnelDisconnected'),
    modeDirectButton: t('remoteSection.modeDirectButton'),
    modeRelayButton: t('remoteSection.modeRelayButton'),
    testDirect: t('remoteSection.testDirect'),
    applyAddress: t('remoteSection.applyAddress'),
    desktopDeviceIdPlaceholder: t('remoteSection.desktopDeviceIdPlaceholder'),
    pairingKeyPlaceholder: t('remoteSection.pairingKeyPlaceholder'),
    stopScan: t('remoteSection.stopScan'),
    scanFill: t('remoteSection.scanFill'),
    connectRelay: t('remoteSection.connectRelay'),
    disconnect: t('remoteSection.disconnect'),
    testTunnel: t('remoteSection.testTunnel'),
    qrContentLabel: t('remoteSection.qrContentLabel'),
    qrContentPlaceholder: t('remoteSection.qrContentPlaceholder'),
    parseQrContent: t('remoteSection.parseQrContent'),
    sessionIdLabel: t('remoteSection.sessionIdLabel'),
    sessionTokenLabel: t('remoteSection.sessionTokenLabel'),
  }
  const swarmTexts = {
    title: t('swarmSection.title'),
    addSwarm: t('swarmSection.addSwarm'),
    addShort: t('swarmSection.addShort'),
    addCustomSwarm: t('swarmSection.addCustomSwarm'),
    loading: t('swarmSection.loading'),
    description: t('swarmSection.description'),
    emptyTitle: t('swarmSection.emptyTitle'),
    emptyHint: t('swarmSection.emptyHint'),
    unknownError: t('swarmSection.unknownError'),
    templateReactName: t('swarmSection.templateReactName'),
    templateReactDescription: t('swarmSection.templateReactDescription'),
    templateNodeName: t('swarmSection.templateNodeName'),
    templateNodeDescription: t('swarmSection.templateNodeDescription'),
    fetchError: t('swarmSection.fetchError'),
    createError: t('swarmSection.createError'),
    updateError: t('swarmSection.updateError'),
    deleteError: t('swarmSection.deleteError'),
    cardUnknown: t('swarmSection.cardUnknown'),
    cardDefaultAgent: t('swarmSection.cardDefaultAgent'),
    cardMcp: t('swarmSection.cardMcp'),
    cardSkills: t('swarmSection.cardSkills'),
    cardEditSwarm: t('swarmSection.cardEditSwarm'),
    cardEdit: t('swarmSection.cardEdit'),
    cardDeleteSwarm: t('swarmSection.cardDeleteSwarm'),
    cardDelete: t('swarmSection.cardDelete'),
    cardCannotDeletePrefix: t('swarmSection.cardCannotDeletePrefix'),
    cardCannotDeleteSuffix: t('swarmSection.cardCannotDeleteSuffix'),
    cardDefaultModel: t('swarmSection.cardDefaultModel'),
    cardProjectsInUseSuffix: t('swarmSection.cardProjectsInUseSuffix'),
    cardUnused: t('swarmSection.cardUnused'),
    cardCreatedAt: t('swarmSection.cardCreatedAt'),
    cardInitPlanTitle: t('swarmSection.cardInitPlanTitle'),
    cardInitPlanHint: t('swarmSection.cardInitPlanHint'),
    cardInitFiles: t('swarmSection.cardInitFiles'),
    cardInitDirectories: t('swarmSection.cardInitDirectories'),
    cardInitSkillEntries: t('swarmSection.cardInitSkillEntries'),
    cardInitTemplateSource: t('swarmSection.cardInitTemplateSource'),
    cardInitTemplateDisabled: t('swarmSection.cardInitTemplateDisabled'),
    cardInitTemplateUnsupported: t('swarmSection.cardInitTemplateUnsupported'),
    cardInitTemplateBranch: t('swarmSection.cardInitTemplateBranch'),
    cardInitNone: t('swarmSection.cardInitNone'),
    sectionOfficial: t('swarmSection.sectionOfficial'),
    sectionCustom: t('swarmSection.sectionCustom'),
    cardSourceOfficial: t('swarmSection.cardSourceOfficial'),
    cardSourceCustom: t('swarmSection.cardSourceCustom'),
    cardCannotEditOfficial: t('swarmSection.cardCannotEditOfficial'),
    cardCannotDeleteOfficial: t('swarmSection.cardCannotDeleteOfficial'),
    cardCloneToCustom: t('swarmSection.cardCloneToCustom'),
    cardCloneOfficialSwarm: t('swarmSection.cardCloneOfficialSwarm'),
    cardPreview: t('swarmSection.cardPreview'),
    cardPreviewSwarm: t('swarmSection.cardPreviewSwarm'),
    cardAgentConfig: t('swarmSection.cardAgentConfig'),
    cardMcpConfig: t('swarmSection.cardMcpConfig'),
    cardProjectRules: t('swarmSection.cardProjectRules'),
    cardAgentGuide: t('swarmSection.cardAgentGuide'),
    previewTitle: t('swarmSection.previewTitle'),
    previewOhMyOpencode: t('swarmSection.previewOhMyOpencode'),
    previewMcpConfig: t('swarmSection.previewMcpConfig'),
    previewSkills: t('swarmSection.previewSkills'),
    previewClaudeMd: t('swarmSection.previewClaudeMd'),
    previewAgentsMd: t('swarmSection.previewAgentsMd'),
    previewCapabilityOverview: t('swarmSection.previewCapabilityOverview'),
    previewAppliesOnProject: t('swarmSection.previewAppliesOnProject'),
    previewAgentVisual: t('swarmSection.previewAgentVisual'),
    previewAgentVisualHint: t('swarmSection.previewAgentVisualHint'),
    previewAgentJsonRaw: t('swarmSection.previewAgentJsonRaw'),
    previewMcpServers: t('swarmSection.previewMcpServers'),
    previewMcpRaw: t('swarmSection.previewMcpRaw'),
    previewInitializationAssets: t('swarmSection.previewInitializationAssets'),
    previewTemplateSource: t('swarmSection.previewTemplateSource'),
    previewTemplateBranch: t('swarmSection.previewTemplateBranch'),
    previewNoTemplateSource: t('swarmSection.previewNoTemplateSource'),
    previewFiles: t('swarmSection.previewFiles'),
    previewDirectories: t('swarmSection.previewDirectories'),
    previewSkillEntries: t('swarmSection.previewSkillEntries'),
    previewNoItems: t('swarmSection.previewNoItems'),
    previewReadOnlyHint: t('swarmSection.previewReadOnlyHint'),
  }
  const aboutTexts = {
    version: t('about.version'),
    title: t('about.title'),
    subtitle: t('about.subtitle'),
    mission: t('about.mission'),
    builtWith: t('about.builtWith'),
    capabilityTitle: t('about.capabilityTitle'),
    capabilityScaffold: t('about.capabilityScaffold'),
    capabilityKanban: t('about.capabilityKanban'),
    capabilitySwarm: t('about.capabilitySwarm'),
    capabilityRemote: t('about.capabilityRemote'),
    licenseTitle: t('about.licenseTitle'),
    licensePrimary: t('about.licensePrimary'),
    licenseSecondary: t('about.licenseSecondary'),
    privacyTitle: t('about.privacyTitle'),
    privacyLocalFirst: t('about.privacyLocalFirst'),
    privacyDataControl: t('about.privacyDataControl'),
    linksTitle: t('about.linksTitle'),
    githubLabel: t('about.githubLabel'),
    giteeLabel: t('about.giteeLabel'),
    docsLabel: t('about.docsLabel'),
    websiteLabel: t('about.websiteLabel'),
    starTitle: t('about.starTitle'),
    starDescription: t('about.starDescription'),
    starGithub: t('about.starGithub'),
    starGitee: t('about.starGitee'),
  }

  const handleSwitchLocale = (nextLocale: AppLocale) => {
    if (activeLocale === nextLocale) {
      return
    }
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`
    setLocale(nextLocale)
  }

  const appearanceOptions: Array<{
    mode: ThemeMode
    label: string
    icon: typeof Sun
    iconClassName: string
  }> = [
    { mode: 'light', label: t('appearance.light'), icon: Sun, iconClassName: 'text-amber-500' },
    { mode: 'dark', label: t('appearance.dark'), icon: Moon, iconClassName: 'text-indigo-500' },
    { mode: 'system', label: t('appearance.system'), icon: Monitor, iconClassName: 'text-muted-foreground' },
  ]

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* 侧边栏 - 桌面端 */}
      {!isMobile && (
        <div className="w-56 shrink-0 border-r border-border bg-card p-4 text-card-foreground">
          <h1 className="mb-6 px-2 text-xl font-bold text-foreground">{t('title')}</h1>

          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      )}

      {/* 主内容区 */}
      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {/* 移动端标签页 */}
        {isMobile && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)} className="w-full mb-4">
            <TabsList className="w-full flex overflow-x-auto no-scrollbar">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="flex-shrink-0 min-w-[70px] flex-col gap-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs">{tab.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        )}

        {/* 桌面端标题 */}
        {!isMobile && activeTab === 'general' && (
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('desktopHeaders.general')}</h2>
        )}
        {!isMobile && activeTab === 'git' && (
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('desktopHeaders.git')}</h2>
        )}
        {!isMobile && activeTab === 'agents' && (
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('desktopHeaders.agents')}</h2>
        )}
        {!isMobile && activeTab === 'remote' && (
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('desktopHeaders.remote')}</h2>
        )}
        {!isMobile && activeTab === 'skills' && (
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('desktopHeaders.skills')}</h2>
        )}
        {!isMobile && activeTab === 'about' && (
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('desktopHeaders.about')}</h2>
        )}

        {/* 内容区 */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* 外观设置 */}
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <h3 className="mb-4 text-base font-semibold text-foreground">
                {t('appearance.title')}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('appearance.description')}
              </p>
              <div className="flex flex-wrap gap-3">
                {appearanceOptions.map((option) => {
                  const Icon = option.icon
                  const isActive = themeMode === option.mode

                  return (
                    <button
                      key={option.mode}
                      onClick={() => setThemeMode(option.mode)}
                      className={`flex flex-col items-center gap-2 px-6 py-4 rounded-xl transition-all ${
                        isActive
                          ? 'border-2 border-primary bg-primary/5'
                          : 'border border-border hover:border-ring/50'
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${option.iconClassName}`} />
                      <span className="text-sm font-medium text-foreground">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 语言设置 */}
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <h3 className="mb-4 text-base font-semibold text-foreground">
                {t('language.title')}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('language.description')}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleSwitchLocale('zh-CN')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all ${
                    activeLocale === 'zh-CN'
                      ? 'border-2 border-primary bg-primary/5'
                      : 'border border-border hover:border-ring/50'
                  }`}
                >
                  <Globe className={`w-5 h-5 ${activeLocale === 'zh-CN' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium text-foreground">{t('language.zhCN')}</span>
                </button>
                <button
                  onClick={() => handleSwitchLocale('en-US')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all ${
                    activeLocale === 'en-US'
                      ? 'border-2 border-primary bg-primary/5'
                      : 'border border-border hover:border-ring/50'
                  }`}
                >
                  <Globe className={`w-5 h-5 ${activeLocale === 'en-US' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium text-foreground">{t('language.enUS')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'git' && (
          <div>
            <WorktreeSettingsSection texts={worktreeTexts} />
          </div>
        )}

        {activeTab === 'remote' && (
          <div>
            <RemoteAccessSection texts={remoteTexts} />
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="h-full -m-4 md:-m-6">
            <SwarmListPage texts={swarmTexts} />
          </div>
        )}

        {activeTab === 'skills' && (
          <div>
            <SkillsSettingsSection texts={skillsTexts} />
          </div>
        )}

        {activeTab === 'about' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{aboutTexts.title}</h3>
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {aboutTexts.version}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{aboutTexts.subtitle}</p>
              <p className="mt-2 text-sm text-muted-foreground">{aboutTexts.mission}</p>
              <p className="mt-4 text-sm text-muted-foreground">{aboutTexts.builtWith}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <h3 className="text-base font-semibold text-foreground">{aboutTexts.capabilityTitle}</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[aboutTexts.capabilityScaffold, aboutTexts.capabilityKanban, aboutTexts.capabilitySwarm, aboutTexts.capabilityRemote].map((item) => (
                  <div key={item} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <h3 className="text-base font-semibold text-foreground">{aboutTexts.licenseTitle}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{aboutTexts.licensePrimary}</p>
              <p className="mt-2 text-sm text-muted-foreground">{aboutTexts.licenseSecondary}</p>
              <h4 className="mt-5 text-sm font-medium text-foreground">{aboutTexts.privacyTitle}</h4>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>{aboutTexts.privacyLocalFirst}</li>
                <li>{aboutTexts.privacyDataControl}</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <h3 className="text-base font-semibold text-foreground">{aboutTexts.linksTitle}</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="https://github.com/hivelaunch/hivelaunch"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                >
                  {aboutTexts.githubLabel}
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href="https://gitee.com/hivelaunch/hivelaunch"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                >
                  {aboutTexts.giteeLabel}
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href="https://docs.hivelaunch.io"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                >
                  {aboutTexts.docsLabel}
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href="http://localhost:4321/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                >
                  {aboutTexts.websiteLabel}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{aboutTexts.starTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{aboutTexts.starDescription}</p>
                  </div>
                  <Star className="mt-0.5 h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href="https://github.com/hivelaunch/hivelaunch/stargazers"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                  >
                    <Star className="h-4 w-4" />
                    {aboutTexts.starGithub}
                  </a>
                  <a
                    href="https://gitee.com/hivelaunch/hivelaunch"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                  >
                    <Star className="h-4 w-4" />
                    {aboutTexts.starGitee}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
