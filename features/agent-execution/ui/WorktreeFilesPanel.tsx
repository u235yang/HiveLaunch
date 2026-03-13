'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, Loader2, Search, X } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import { useUIStore } from '@/features/shared/store'
import { useMobile } from '@/hooks/use-mobile'
import { useWorktreeFilePreview, useWorktreeFiles } from '../hooks/useWorktreeFiles'
import { listWorktreeFiles, type WorktreeFileEntry } from '../lib/git-operations'
import { formatWorktreePreviewContent, isMarkdownPreview } from '../lib/worktree-preview'
import { MarkdownText } from './assistant-ui/MarkdownText'

interface WorktreeFilesPanelProps {
  worktreePath: string
  selectedFile?: string | null
  onSelectedFileChange?: (path: string | null) => void
  onOpenFile?: (path: string) => void
  mode?: 'split' | 'navigation'
}

interface TreeRow {
  path: string
  depth: number
  entry: WorktreeFileEntry
}

interface ContextMenuState {
  x: number
  y: number
  entry: WorktreeFileEntry
}

function formatBytes(size: number | null) {
  if (size === null) {
    return '-'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function WorktreeFilesPanel({
  worktreePath,
  selectedFile: controlledSelectedFile,
  onSelectedFileChange,
  onOpenFile,
  mode = 'split',
}: WorktreeFilesPanelProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [search, setSearch] = useState('')
  const [uncontrolledSelectedFile, setUncontrolledSelectedFile] = useState<string | null>(null)
  const selectedFile = controlledSelectedFile !== undefined ? controlledSelectedFile : uncontrolledSelectedFile
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const [treeCache, setTreeCache] = useState<Record<string, WorktreeFileEntry[]>>({})
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const rootQuery = useWorktreeFiles(worktreePath, '', !!worktreePath)
  const rootQueryErrorMessage = rootQuery.error instanceof Error
    ? rootQuery.error.message
    : txt('加载文件失败', 'Failed to load files')

  useEffect(() => {
    if (onSelectedFileChange) {
      onSelectedFileChange(null)
    } else {
      setUncontrolledSelectedFile(null)
    }
    setExpandedPaths(new Set())
    setTreeCache({})
  }, [onSelectedFileChange, worktreePath])

  useEffect(() => {
    if (!rootQuery.data) {
      return
    }
    setTreeCache((prev) => ({ ...prev, '': rootQuery.data ?? [] }))
  }, [rootQuery.data])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeMenu = () => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const loadDirectory = useCallback(
    async (path: string) => {
      if (treeCache[path] || loadingDirs.has(path)) {
        return
      }
      setLoadingDirs((prev) => new Set(prev).add(path))
      try {
        const children = await listWorktreeFiles(worktreePath, path)
        setTreeCache((prev) => ({ ...prev, [path]: children }))
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev)
          next.delete(path)
          return next
        })
      }
    },
    [loadingDirs, treeCache, worktreePath]
  )

  const toggleDirectory = useCallback(
    async (path: string) => {
      const isExpanded = expandedPaths.has(path)
      if (isExpanded) {
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.delete(path)
          return next
        })
        return
      }
      setExpandedPaths((prev) => new Set(prev).add(path))
      await loadDirectory(path)
    },
    [expandedPaths, loadDirectory]
  )

  const rows = useMemo(() => {
    const allRows: TreeRow[] = []
    const keyword = search.trim().toLowerCase()
    const visit = (basePath: string, depth: number) => {
      const entries = treeCache[basePath] ?? []
      for (const entry of entries) {
        const include = keyword.length === 0 || entry.name.toLowerCase().includes(keyword)
        if (include) {
          allRows.push({ path: entry.path, depth, entry })
        }
        if (entry.isDir && expandedPaths.has(entry.path)) {
          visit(entry.path, depth + 1)
        }
      }
    }
    visit('', 0)
    return allRows
  }, [expandedPaths, search, treeCache])

  const showInlinePreview = mode === 'split'

  const getAbsolutePath = useCallback(
    (entryPath: string) => {
      if (!entryPath) {
        return worktreePath
      }
      const normalizedBase = worktreePath.endsWith('/') ? worktreePath.slice(0, -1) : worktreePath
      const normalizedEntry = entryPath.startsWith('/') ? entryPath.slice(1) : entryPath
      return `${normalizedBase}/${normalizedEntry}`
    },
    [worktreePath]
  )

  const getRelativePath = useCallback((entryPath: string) => {
    return entryPath || '.'
  }, [])

  const handleCopyAbsolutePath = useCallback(
    async (entryPath: string) => {
      const absolutePath = getAbsolutePath(entryPath)
      await navigator.clipboard.writeText(absolutePath)
      setContextMenu(null)
    },
    [getAbsolutePath]
  )

  const handleCopyRelativePath = useCallback(
    async (entryPath: string) => {
      const relativePath = getRelativePath(entryPath)
      await navigator.clipboard.writeText(relativePath)
      setContextMenu(null)
    },
    [getRelativePath]
  )

  return (
    <div className="h-full flex">
      <div className={showInlinePreview ? 'w-[45%] border-r border-border flex flex-col min-w-[280px]' : 'w-full flex flex-col'}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={txt('搜索文件名', 'Search files')}
              className="w-full h-9 rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {!worktreePath ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {txt('未找到可用的工作区目录', 'No workspace directory available')}
            </div>
          ) : rootQuery.isLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{txt('正在加载文件', 'Loading files')}</span>
            </div>
          ) : rootQuery.isError ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-3 px-4 text-center">
              <span className="text-destructive">{rootQueryErrorMessage}</span>
              <button
                type="button"
                onClick={() => void rootQuery.refetch()}
                className="h-8 rounded-md border border-border px-3 text-xs text-foreground hover:bg-muted/60"
              >
                {txt('重试加载', 'Retry')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {txt('暂无匹配文件', 'No matching files')}
            </div>
          ) : (
            <Virtuoso
              data={rows}
              overscan={200}
              itemContent={(_, row) => {
                const { entry } = row
                const isSelected = selectedFile === entry.path
                const isExpanded = entry.isDir && expandedPaths.has(entry.path)
                const isLoadingDir = loadingDirs.has(entry.path)
                return (
                  <button
                    type="button"
                    onClick={async () => {
                      if (entry.isDir) {
                        await toggleDirectory(entry.path)
                        return
                      }
                      if (onSelectedFileChange) {
                        onSelectedFileChange(entry.path)
                      } else {
                        setUncontrolledSelectedFile(entry.path)
                      }
                      onOpenFile?.(entry.path)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        entry,
                      })
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b border-border/50 ${
                      isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
                    }`}
                    style={{ paddingLeft: `${12 + row.depth * 16}px` }}
                  >
                    {entry.isDir ? (
                      <>
                        {isLoadingDir ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <Folder className="h-4 w-4 text-amber-500" />
                      </>
                    ) : (
                      <>
                        <span className="w-3.5" />
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </>
                    )}
                    <span className="truncate flex-1">{entry.name}</span>
                    {!entry.isDir && <span className="text-xs text-muted-foreground">{formatBytes(entry.size)}</span>}
                  </button>
                )
              }}
            />
          )}
        </div>
      </div>

      {showInlinePreview ? <WorktreeFilePreviewPane worktreePath={worktreePath} filePath={selectedFile} /> : null}
      {contextMenu ? (
        <div
          className="fixed z-[90] min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopyAbsolutePath(contextMenu.entry.path)}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {txt('复制绝对路径', 'Copy absolute path')}
          </button>
          <div className="px-2 py-1 text-xs text-muted-foreground truncate">
            {getAbsolutePath(contextMenu.entry.path)}
          </div>
          <div className="h-px bg-border my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopyRelativePath(contextMenu.entry.path)}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {txt('复制相对路径', 'Copy relative path')}
          </button>
          <div className="px-2 py-1 text-xs text-muted-foreground truncate">
            {getRelativePath(contextMenu.entry.path)}
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface WorktreeFilePreviewPaneProps {
  worktreePath: string
  filePath: string | null
  onClose?: () => void
  className?: string
}

export function WorktreeFilePreviewPane({ worktreePath, filePath, onClose, className }: WorktreeFilePreviewPaneProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const isMobile = useMobile()
  const showMobileBackButton = isMobile && !!onClose
  const previewQuery = useWorktreeFilePreview(worktreePath, filePath, 400_000)
  const preview = previewQuery.data
  const previewContent = preview ? formatWorktreePreviewContent(preview) : ''
  const isMarkdown = isMarkdownPreview(preview?.language ?? null, filePath)

  return (
    <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${className ?? ''}`}>
      <div
        className="h-12 shrink-0 px-4 border-b border-border flex items-center justify-between gap-3"
        style={showMobileBackButton ? {
          paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          minHeight: 'calc(3rem + env(safe-area-inset-top))',
        } : undefined}
      >
        {showMobileBackButton ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted/70"
            aria-label={txt('返回文件列表', 'Back to file list')}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{txt('返回文件列表', 'Back to file list')}</span>
          </button>
        ) : (
          <span className="text-sm text-muted-foreground truncate">
            {filePath ?? txt('选择文件查看预览', 'Select a file to preview')}
          </span>
        )}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground flex items-center justify-center shrink-0"
            aria-label={txt('关闭预览', 'Close preview')}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
        {!filePath ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            {txt('仅支持只读预览', 'Read-only preview only')}
          </div>
        ) : previewQuery.isLoading ? (
          <div className="h-full flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{txt('正在加载预览', 'Loading preview')}</span>
          </div>
        ) : preview?.isBinary ? (
          <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
            {txt('该文件为二进制或不可预览格式', 'This file is binary or not previewable')}
          </div>
        ) : (
          <div className="space-y-3">
            {preview?.truncated ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {txt('文件过大，仅展示截断内容', 'File too large, showing truncated content')}
              </div>
            ) : null}
            {isMarkdown ? (
              <div className="rounded-md border border-border p-4 bg-card text-card-foreground overflow-x-auto">
                <MarkdownText text={previewContent} />
              </div>
            ) : (
              <pre className="rounded-md border border-border p-4 bg-muted/30 overflow-auto text-xs leading-5 text-foreground">
                {previewContent}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
