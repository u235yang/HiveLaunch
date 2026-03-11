'use client'

import { useState } from 'react'
import { FolderOpen, Loader2, RefreshCw, FolderSearch } from 'lucide-react'
import { isTauriEnvironment, resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { useUIStore } from '@/features/shared/store'

interface LocalRepoPickerButtonProps {
  onSelect: (path: string) => void
  selectedPath?: string
}

interface RepoEntry {
  name: string
  path: string
  isDirectory: boolean
}

export function LocalRepoPickerButton({ onSelect, selectedPath }: LocalRepoPickerButtonProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const [isOpen, setIsOpen] = useState(false)
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPickingDirectory, setIsPickingDirectory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanPath, setScanPath] = useState('')
  const [activeScanPath, setActiveScanPath] = useState<string | null>(null)

  const loadRepos = async (path?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      const trimmedPath = path?.trim()
      if (trimmedPath) {
        params.set('path', trimmedPath)
      }
      const endpoint = params.toString()
        ? `/api/filesystem/git-repos?${params.toString()}`
        : '/api/filesystem/git-repos'
      const response = await fetch(resolveHttpUrl(endpoint))
      const result = await response.json()

      if (result.success) {
        setRepos(result.data || [])
        setActiveScanPath(trimmedPath || null)
      } else {
        setError(result.message || 'Failed to load repos')
      }
    } catch (err) {
      setError('Failed to load repos')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClick = () => {
    setIsOpen(!isOpen)
    if (!isOpen && repos.length === 0) {
      loadRepos(undefined)
    }
  }

  const handleSelect = (path: string) => {
    onSelect(path)
    setIsOpen(false)
  }

  const handleScanPath = async () => {
    await loadRepos(scanPath)
  }

  const handlePickDirectory = async () => {
    setError(null)
    if (!isTauriEnvironment()) {
      setError(txt('系统目录选择仅支持桌面端，请手动输入目录路径。', 'System directory picker is available in desktop app.'))
      return
    }
    setIsPickingDirectory(true)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        directory: true,
        multiple: false,
        title: txt('选择 Git 仓库目录', 'Select Git Repository Directory'),
      })
      if (typeof picked === 'string' && picked.trim()) {
        onSelect(picked)
        setIsOpen(false)
      }
    } catch {
      setError(txt('打开系统目录失败，请重试。', 'Failed to open system directory picker.'))
    } finally {
      setIsPickingDirectory(false)
    }
  }

  if (!isOpen) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={handleClick}
          className="h-12 px-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 whitespace-nowrap"
        >
          <FolderOpen className="w-4 h-4" />
          {txt('选择本地', 'Pick Local')}
        </button>
        {selectedPath ? (
          <p className="text-xs text-gray-500 break-all max-w-80">{selectedPath}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="absolute right-0 top-0 z-50 mt-12 w-80 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {txt('选择本地 Git 仓库', 'Select Local Git Repository')}
        </span>
        <button
          type="button"
          onClick={() => {
            void loadRepos(undefined)
          }}
          disabled={isLoading}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <button
          type="button"
          onClick={handlePickDirectory}
          disabled={isPickingDirectory}
          className="w-full h-9 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2"
        >
          {isPickingDirectory ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
          {txt('系统目录选择', 'System Directory Picker')}
        </button>
        <div className="flex gap-2">
          <input
            value={scanPath}
            onChange={(event) => setScanPath(event.target.value)}
            placeholder={txt('输入目录后扫描', 'Scan specific folder')}
            className="flex-1 h-9 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-xs text-gray-700 dark:text-gray-300"
          />
          <button
            type="button"
            onClick={handleScanPath}
            disabled={isLoading}
            className="h-9 px-3 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {txt('扫描', 'Scan')}
          </button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {isLoading && repos.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">{txt('扫描中...', 'Scanning...')}</span>
          </div>
        ) : error ? (
          <div className="py-4 text-center text-red-500 text-sm">
            {error}
          </div>
        ) : repos.length === 0 ? (
          <div className="py-4 text-center text-gray-400 text-sm">
            {txt('未找到本地 Git 仓库', 'No local Git repositories found')}
            <p className="mt-1 text-xs">
              {activeScanPath
                ? txt(`当前目录: ${activeScanPath}`, `Current folder: ${activeScanPath}`)
                : txt('当前目录: 默认目录', 'Current folder: default')}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {repos.map((repo) => (
              <li key={repo.path}>
                <button
                  type="button"
                  onClick={() => handleSelect(repo.path)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {repo.name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 truncate ml-6">
                    {repo.path}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
        {activeScanPath ? (
          <div className="px-1 pb-2 text-xs text-gray-500 break-all">
            {txt(`扫描目录: ${activeScanPath}`, `Scanned folder: ${activeScanPath}`)}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {txt('关闭', 'Close')}
        </button>
      </div>
    </div>
  )
}
