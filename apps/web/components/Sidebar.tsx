'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Plus, Settings, LayoutGrid, MoreHorizontal, X, FolderTree, GitBranch, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react'
import { useProjectStore, useUIStore } from '@/features/shared/store'
import { useMobile } from '@/hooks/use-mobile'
import { WorktreeFilePreviewPane, WorktreeFilesPanel } from '@/features/agent-execution/ui/WorktreeFilesPanel'
import { CommitDialog } from '@/features/agent-execution/ui/CommitDialog'
import { useGitBranchStatus, useGitPull, useGitPush } from '@/features/agent-execution/hooks'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@hivelaunch/shared-ui'

const SIDEBAR_EXPANDED_WIDTH = 240

function SidebarFileGitActions({
  worktreePath,
  targetBranch,
}: {
  worktreePath: string
  targetBranch: string
}) {
  const t = useTranslations('sidebar')
  const { data: status, refetch } = useGitBranchStatus(worktreePath, targetBranch)
  const pullMutation = useGitPull()
  const pushMutation = useGitPush()
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const currentBranch = status?.current_branch ?? ''
  const hasUncommittedChanges = status?.has_uncommitted_changes ?? false
  const isPending = pullMutation.isPending || pushMutation.isPending

  useEffect(() => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }, [worktreePath, currentBranch])

  const handlePull = async () => {
    if (!worktreePath) {
      return
    }
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await pullMutation.mutateAsync({
        worktreePath,
        remote: 'origin',
        branch: currentBranch || undefined,
      })
      if (result.success) {
        setSuccessMessage(result.message || t('pullSuccess'))
      } else {
        setErrorMessage(result.error?.message || result.message || t('gitOperationFailed'))
      }
      refetch()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('gitOperationFailed'))
      refetch()
    }
  }

  const handlePush = async () => {
    if (!worktreePath || !currentBranch) {
      setErrorMessage(t('noBranch'))
      return
    }
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await pushMutation.mutateAsync({
        worktreePath,
        remote: 'origin',
        branch: currentBranch,
      })
      if (result.success) {
        setSuccessMessage(result.message || t('pushSuccess'))
      } else {
        setErrorMessage(result.message || t('gitOperationFailed'))
      }
      refetch()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('gitOperationFailed'))
      refetch()
    }
  }

  const handleCommitSuccess = () => {
    setSuccessMessage(t('commitSuccess'))
    setErrorMessage(null)
    refetch()
  }

  return (
    <div className="border-b border-slate-200 dark:border-zinc-800 p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <GitBranch className="w-3.5 h-3.5" />
        <span className="truncate">{currentBranch || t('noBranch')}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={handlePull}
          disabled={isPending}
          className="h-7 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700 text-xs font-medium"
        >
          {pullMutation.isPending ? t('pulling') : t('pull')}
        </button>
        <button
          type="button"
          onClick={handlePush}
          disabled={isPending || !currentBranch}
          className="h-7 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700 text-xs font-medium"
        >
          {pushMutation.isPending ? t('pushing') : t('push')}
        </button>
        <button
          type="button"
          onClick={() => setIsCommitDialogOpen(true)}
          disabled={isPending || !hasUncommittedChanges}
          className="h-7 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700 text-xs font-medium"
        >
          {t('commit')}
        </button>
      </div>
      {errorMessage ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-[11px] text-destructive flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span className="break-words">{errorMessage}</span>
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" />
          <span className="break-words">{successMessage}</span>
        </div>
      ) : null}
      <CommitDialog
        isOpen={isCommitDialogOpen}
        onClose={() => setIsCommitDialogOpen(false)}
        worktreePath={worktreePath}
        onSuccess={handleCommitSuccess}
      />
    </div>
  )
}

// 项目下拉菜单组件 - 使用 Portal 解决 overflow 裁剪问题
function ProjectMenu({
  projectId,
  isOpen,
  onToggle,
  onClose,
}: {
  projectId: string
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const t = useTranslations('sidebar')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteProject = useProjectStore((state) => state.deleteProject)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteProject(projectId)
      setIsDeleteDialogOpen(false)
      onClose()
    } catch (error) {
      console.error('Failed to delete project:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  // 更新菜单位置
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.top,
        left: rect.right + 4,
      })
    }
  }, [isOpen])

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        // 检查是否点击了菜单内容
        const menuContent = document.getElementById(`project-menu-${projectId}`)
        if (menuContent && !menuContent.contains(event.target as Node)) {
          onClose()
        }
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose, projectId])

  // ESC 关闭
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }}
        className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen && createPortal(
        <div
          id={`project-menu-${projectId}`}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 9999,
          }}
          className="w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700 py-1"
        >
          <Link
            href={`/projects?id=${projectId}&view=config`}
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            {t('projectSettings')}
          </Link>
          <button
            onClick={() => {
              onClose()
              setIsDeleteDialogOpen(true)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('deleteProject')}
          </button>
        </div>,
        document.body
      )}

      {/* 删除确认对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteProjectConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('deleteProjectConfirmMessage')}
          </p>
          <DialogFooter>
            <button
              onClick={() => setIsDeleteDialogOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDeleting ? t('deleting') : t('delete')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
const SIDEBAR_COLLAPSED_WIDTH = 56

export default function Sidebar() {
  const t = useTranslations('sidebar')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [listMode, setListMode] = useState<'projects' | 'files'>('projects')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const isMobile = useMobile()

  const projects = useProjectStore((state) => state.projects)
  const fetchProjects = useProjectStore((state) => state.fetchProjects)

  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const mobileSidebarOpen = useUIStore((state) => state.mobileSidebarOpen)
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (isMobile && mobileSidebarOpen) {
      fetchProjects()
    }
  }, [isMobile, mobileSidebarOpen, fetchProjects])

  const routeKey = useMemo(() => {
    const search = searchParams.toString()
    return search.length > 0 ? `${pathname}?${search}` : pathname
  }, [pathname, searchParams])

  useEffect(() => {
    if (isMobile) {
      setMobileSidebarOpen(false)
      setOpenMenuId(null)
    }
  }, [routeKey, isMobile, setMobileSidebarOpen])

  const activeProjectId = useMemo(() => {
    return searchParams.get('id')
  }, [searchParams])
  const activeProject = useMemo(() => {
    if (!activeProjectId) {
      return null
    }
    return projects.find((project) => project.id === activeProjectId) ?? null
  }, [activeProjectId, projects])
  const previewPortalTarget =
    typeof document === 'undefined'
      ? null
      : document.getElementById('kanban-file-preview-overlay-host')
  const isPreviewDrawerVisible =
    !sidebarCollapsed &&
    listMode === 'files' &&
    !!previewFilePath &&
    !!activeProject
  const mobilePreviewTopOffset = 'calc(var(--top-nav-height, 2.5rem) + env(safe-area-inset-top))'

  // 收起时的宽度
  const width = sidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_EXPANDED_WIDTH
  const shouldCollapseContent = !isMobile && sidebarCollapsed

  useEffect(() => {
    setSelectedFile(null)
    setPreviewFilePath(null)
  }, [activeProject?.id, activeProject?.repoPath])

  useEffect(() => {
    if (listMode !== 'files' || sidebarCollapsed) {
      setPreviewFilePath(null)
    }
  }, [listMode, sidebarCollapsed])

  return (
    <>
      {/* 移动端遮罩层 (Overlay) - 仅在移动端且侧边栏打开时显示 */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          flex flex-col bg-white dark:bg-zinc-900 shrink-0 overflow-hidden
          // 边框
          border-r border-slate-200 dark:border-zinc-800
          // 移动端: 固定定位，抽屉模式
          ${isMobile ? 'fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300' : 'relative'}
          // 移动端显示/隐藏状态
          ${isMobile && mobileSidebarOpen ? 'translate-x-0' : isMobile ? '-translate-x-full' : ''}
        `}
        style={!isMobile ? { width: width } : undefined}
      >
      {/* 移动端关闭按钮 - 仅在移动端显示 */}
      {isMobile && (
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800">
          <span className="font-semibold text-slate-900 dark:text-white">{t('menu')}</span>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label={t('closeMenu')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 折叠/展开按钮 - 仅桌面端，垂直居中 */}
      {!isMobile && (
        <button
          onClick={toggleSidebar}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          title={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      )}

      {/* 内容区域 - 隐藏时使用 overflow-hidden */}
      <div 
        className={`flex flex-col h-full transition-all duration-200 ease-in-out ${
          shouldCollapseContent ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="p-3 flex-1 min-h-0">
            <div className="h-full flex flex-col min-h-0">
              {/* 项目列表标题 */}
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {listMode === 'projects' ? t('projectList') : t('fileList')}
                </h3>
                {listMode === 'projects' ? (
                  <Link
                    href="/projects/new"
                    onClick={() => isMobile && setMobileSidebarOpen(false)}
                    className="text-slate-400 hover:text-primary transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </Link>
                ) : (
                  <FolderTree className="w-4 h-4 text-slate-400" />
                )}
              </div>

            <div className="mb-2 px-3">
              <div className="grid grid-cols-2 rounded-md bg-slate-100 dark:bg-zinc-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setListMode('projects')}
                  className={`h-7 rounded text-xs font-medium transition-colors ${
                    listMode === 'projects'
                      ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {t('projectList')}
                </button>
                <button
                  type="button"
                  onClick={() => setListMode('files')}
                  className={`h-7 rounded text-xs font-medium transition-colors ${
                    listMode === 'files'
                      ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {t('fileList')}
                </button>
              </div>
            </div>

            {listMode === 'projects' ? (
              <nav className="space-y-0.5 overflow-y-auto">
                {projects.map((project) => {
                  const isActive = activeProjectId === project.id
                  return (
                    <div
                      key={project.id}
                      className={`group flex items-center rounded-lg ${
                        isActive
                          ? 'text-primary bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/5'
                          : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <Link
                        href={`/projects?id=${project.id}&view=board`}
                        onClick={() => isMobile && setMobileSidebarOpen(false)}
                        className={`flex-1 flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'text-primary'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <LayoutGrid
                          className={`w-5 h-5 shrink-0 ${
                            isActive ? 'text-primary' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{project.name}</span>
                      </Link>
                      <div className="pr-2">
                        <ProjectMenu
                          projectId={project.id}
                          isOpen={openMenuId === project.id}
                          onToggle={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                          onClose={() => setOpenMenuId(null)}
                        />
                      </div>
                    </div>
                  )
                })}
              </nav>
            ) : activeProject ? (
              <div className="flex-1 min-h-0 rounded-md border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <div className="h-full min-h-0 flex flex-col">
                  <SidebarFileGitActions
                    worktreePath={activeProject.repoPath}
                    targetBranch={activeProject.targetBranch}
                  />
                  <div className="flex-1 min-h-0">
                    <WorktreeFilesPanel
                      worktreePath={activeProject.repoPath}
                      selectedFile={selectedFile}
                      onSelectedFileChange={setSelectedFile}
                      onOpenFile={setPreviewFilePath}
                      mode="navigation"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('noActiveProject')}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer: Settings */}
        <div className="mt-auto p-4 border-t border-slate-200 dark:border-zinc-800">
          <Link
            href="/settings"
            onClick={() => isMobile && setMobileSidebarOpen(false)}
            className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors group"
          >
            <Settings className="w-5 h-5 text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
            {t('settings')}
          </Link>
        </div>
      </div>

      {/* 收起状态下的迷你视图 - 桌面端 */}
      <div
        className={`hidden md:block absolute inset-0 flex flex-col items-center py-3 transition-all duration-200 ease-in-out ${
          sidebarCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 折叠状态只显示项目图标 */}
        <div className="flex-1 w-full flex flex-col items-center gap-1 overflow-hidden">
          {projects.map((project) => {
            const isActive = activeProjectId === project.id
            return (
              <Link
                key={project.id}
                href={`/projects?id=${project.id}&view=board`}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
                title={project.name}
              >
                <LayoutGrid className="w-5 h-5" />
              </Link>
            )
          })}
        </div>

        {/* 折叠状态下的设置按钮 */}
        <Link
          href="/settings"
          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title={t('settings')}
        >
          <Settings className="w-5 h-5" />
        </Link>

        {/* 折叠状态下添加项目按钮 */}
        <Link
          href="/projects/new"
          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
          title={t('createProject')}
        >
          <Plus className="w-5 h-5" />
        </Link>
      </div>
    </aside>
    {isPreviewDrawerVisible && activeProject && (previewPortalTarget && !isMobile
      ? createPortal(
        <div
          className="absolute inset-y-0 right-0 z-40 flex min-h-0 overflow-hidden border-l border-border bg-card shadow-2xl"
          style={{ width: 'min(65%, 920px)' }}
        >
          <WorktreeFilePreviewPane
            worktreePath={activeProject.repoPath}
            filePath={previewFilePath}
            onClose={() => setPreviewFilePath(null)}
            className="h-full min-h-0 w-full"
          />
        </div>,
        previewPortalTarget
      )
      : createPortal(
        <>
          {isMobile ? (
            <div
              className="fixed inset-x-0 bottom-0 z-[60] bg-black/40"
              style={{ top: mobilePreviewTopOffset }}
              onClick={() => setPreviewFilePath(null)}
            />
          ) : null}
          <div
            className="fixed right-0 bottom-0 z-[70] flex min-h-0 overflow-hidden border-l border-border bg-card shadow-2xl"
            style={isMobile
              ? { width: '100vw', top: mobilePreviewTopOffset }
              : { width: 'min(65vw, 920px)', top: 0 }}
          >
            <WorktreeFilePreviewPane
              worktreePath={activeProject.repoPath}
              filePath={previewFilePath}
              onClose={() => setPreviewFilePath(null)}
              className="h-full min-h-0 w-full"
            />
          </div>
        </>,
        document.body
      ))}
    </>
  )
}
