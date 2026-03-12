// F3: Workspace Creator - Git Worktree 创建
// 统一使用 HTTP API 调用后端，确保 Web、Desktop、Mobile 三端功能一致

import { resolveHttpUrl } from './api-config'
import { getGlobalSettings } from '@/features/settings/lib/settings-api'

// ============ HTTP API 调用 ============

async function httpRequest<T>(endpoint: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) {
    options.body = JSON.stringify(body)
  }

  // 调试日志
  console.log('[httpRequest] Sending request:', {
    url: resolveHttpUrl(endpoint),
    method: options.method,
    hasBody: !!body,
    bodyPreview: body ? JSON.stringify(body).slice(0, 200) : undefined,
  })

  const response = await fetch(resolveHttpUrl(endpoint), options)

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text as T
  }
}

async function httpDelete<T>(endpoint: string): Promise<T> {
  const response = await fetch(resolveHttpUrl(endpoint), {
    method: 'DELETE',
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text as T
  }
}

export interface WorkspaceConfig {
  taskId: string
  repoPath: string
  targetBranch: string
  setupScript?: string
  copyFiles?: string[]
}

export interface WorkspaceInfo {
  id: string
  branch: string
  path: string
  baseBranch?: string  // 目标分支（用户选择的分支）
  createdAt: string
}

export interface WorktreeInfo {
  id: string
  path: string
  branch: string
  baseBranch?: string  // 新增：目标分支（用户选择的分支）
}

export interface WorktreeStatus {
  has_uncommitted_changes: boolean
  files_changed: number
}

export interface BranchDiffStats {
  commits_ahead: number
  commits_behind: number
}

interface RepoBranch {
  name: string
  is_current: boolean
  is_remote: boolean
}

function normalizeBranchName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  if (trimmed.includes('->')) {
    const parts = trimmed.split('->')
    return (parts[parts.length - 1] || '').trim().replace(/^origin\//, '')
  }
  return trimmed.replace(/^origin\//, '').replace(/^remotes\//, '')
}

async function listRepoBranches(repoPath: string): Promise<RepoBranch[]> {
  const response = await fetch(
    resolveHttpUrl(`/api/git/branches?path=${encodeURIComponent(repoPath)}`)
  )
  if (!response.ok) {
    throw new Error(`Failed to list branches (${response.status}): ${await response.text()}`)
  }
  const raw = await response.json() as unknown
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      name: normalizeBranchName(typeof item.name === 'string' ? item.name : ''),
      is_current: Boolean(item.is_current),
      is_remote: Boolean(item.is_remote),
    }))
    .filter((item) => item.name !== '')
}

function resolveBaseBranch(targetBranch: string, branches: RepoBranch[]): string {
  const normalizedTarget = normalizeBranchName(targetBranch || '')
  const names = new Set(branches.map((b) => b.name))

  if (normalizedTarget && names.has(normalizedTarget)) {
    return normalizedTarget
  }
  return normalizedTarget || 'main'
}

/**
 * 创建新的 Workspace（包括 Git Worktree）
 *
 * 业务流程：
 * 1. 用户选择"目标分支"（如 master）
 * 2. 系统自动创建新分支 <prefix>/<task-id>
 * 3. 从目标分支创建 worktree 并切换到新分支
 * 4. Git 面板显示：<prefix>/<task-id> -> master
 */
export async function createWorkspace(
  config: WorkspaceConfig
): Promise<WorkspaceInfo> {
  // 调试日志
  console.log('[workspace-creator] createWorkspace called with config:', JSON.stringify(config, null, 2))

  // 获取全局设置中的分支前缀
  const settings = await getGlobalSettings()
  const branchPrefix = settings.branch_prefix || 'hive-'

  // 自动生成唯一的 worktree 分支名
  // 格式：<prefix>/<task-id-short>-<timestamp>（prefix 末尾不带 /
  const timestamp = Date.now().toString(36).slice(-6)
  const taskIdShort = config.taskId.slice(-8)
  // 确保 prefix 不以 / 结尾，避免重复
  const normalizedPrefix = branchPrefix.endsWith('/')
    ? branchPrefix.slice(0, -1)
    : branchPrefix
  const worktreeBranch = `${normalizedPrefix}/${taskIdShort}-${timestamp}`

  // 用户选择的分支作为基准分支（目标分支）
  // 用户选择的分支 → 合并回目标分支
  console.log('[workspace-creator] config.targetBranch:', config.targetBranch)
  // 修复：使用 'main' 作为默认值，而不是硬编码的 'master'
  // 更好的做法是从项目配置中读取 targetBranch
  let branches: RepoBranch[] = []
  try {
    branches = await listRepoBranches(config.repoPath)
  } catch (error) {
    console.warn('[workspace-creator] failed to list branches, fallback to requested branch:', {
      repoPath: config.repoPath,
      targetBranch: config.targetBranch,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  const baseBranch = resolveBaseBranch(config.targetBranch, branches)
  console.log('[workspace-creator] baseBranch:', baseBranch)
  const requestedBranch = normalizeBranchName(config.targetBranch)
  const availableBranchNames = new Set(branches.map((branch) => branch.name))
  if (branches.length > 0 && requestedBranch && !availableBranchNames.has(requestedBranch)) {
    console.error('[workspace-creator] target branch does not exist:', {
      requested: config.targetBranch,
      resolved: baseBranch,
      repoPath: config.repoPath,
      availableBranchCount: branches.length,
    })
    throw new Error(`Target branch "${config.targetBranch}" does not exist in repository`)
  }

  let rawWorktreeInfo: Record<string, unknown> | string | null = null
  try {
    rawWorktreeInfo = await httpRequest<Record<string, unknown> | string>('/api/workspaces', {
      repo_path: config.repoPath,
      branch: worktreeBranch,
      base_branch: baseBranch,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const invalidReference = errorMessage.includes('invalid reference')
    const noCommitHint = branches.length === 0 || errorMessage.includes('Needed a single revision')
    if (invalidReference && noCommitHint) {
      throw new Error('Repository has no valid commits yet. Please create an initial commit before creating workspace.')
    }
    throw error
  }

  const parsed = typeof rawWorktreeInfo === 'object' && rawWorktreeInfo
    ? rawWorktreeInfo as Record<string, unknown>
    : {}

  const worktreeId = typeof parsed.id === 'string' ? parsed.id.trim() : ''
  const worktreePath = typeof parsed.path === 'string' ? parsed.path.trim() : ''
  const worktreeBranchFromResponse = typeof parsed.branch === 'string' ? parsed.branch.trim() : ''
  const baseBranchFromResponse =
    typeof parsed.baseBranch === 'string'
      ? parsed.baseBranch
      : (typeof parsed.base_branch === 'string' ? parsed.base_branch : undefined)

  if (!worktreeId || !worktreePath || !worktreeBranchFromResponse) {
    console.error('[workspace-creator] Invalid create workspace response:', {
      rawWorktreeInfo,
      repoPath: config.repoPath,
      targetBranch: config.targetBranch,
      worktreeBranch,
      baseBranch,
      availableBranchCount: branches.length,
    })
    if (typeof rawWorktreeInfo === 'string' && rawWorktreeInfo.includes('invalid reference')) {
      throw new Error(`Cannot create workspace from branch "${baseBranch}". The branch may have no commit yet.`)
    }
    throw new Error('Invalid workspace response: missing id/path/branch')
  }

  // 如果有 setup 脚本，运行它
  if (config.setupScript) {
    await runSetupScript(config.setupScript, worktreePath)
  }

  // 如果有需要拷贝的文件
  if (config.copyFiles && config.copyFiles.length > 0) {
    await copyFiles(config.copyFiles, worktreePath)
  }

  return {
    id: worktreeId,
    branch: worktreeBranchFromResponse,
    path: worktreePath,
    baseBranch: baseBranchFromResponse || baseBranch,
    createdAt: new Date().toISOString(),
  }
}

/**
 * 删除 Workspace（包括 Git Worktree）
 */
export async function cleanupWorkspace(
  repoPath: string,
  workspaceId: string
): Promise<void> {
  // 注意：当前 HTTP API 删除 workspace 不需要 repoPath 参数
  // 但为了保持接口兼容性，保留 repoPath 参数
  return httpDelete<void>(`/api/workspaces/${workspaceId}`)
}

/**
 * 获取 Worktree 状态
 */
export async function getWorktreeStatus(
  repoPath: string,
  worktreePath: string
): Promise<WorktreeStatus> {
  return httpRequest<WorktreeStatus>('/api/workspaces/status', {
    repoPath,
    worktreePath,
  })
}

/**
 * 获取分支差异统计
 */
export async function getBranchDiffStats(
  repoPath: string,
  worktreePath: string,
  targetBranch: string
): Promise<BranchDiffStats> {
  return httpRequest<BranchDiffStats>('/api/workspaces/diff-stats', {
    repoPath,
    worktreePath,
    targetBranch,
  })
}

/**
 * 列出所有 Worktrees
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  const response = await fetch(
    resolveHttpUrl(`/api/workspaces?repo_path=${encodeURIComponent(repoPath)}`)
  )
  if (!response.ok) {
    throw new Error(`Failed to list worktrees: ${await response.text()}`)
  }
  return response.json()
}

/**
 * 运行 setup 脚本
 */
async function runSetupScript(_script: string, _worktreePath: string): Promise<void> {
  // TODO: 实现脚本执行
  // 可以通过 Tauri shell plugin 或自定义 command 执行
}

/**
 * 拷贝配置文件
 */
async function copyFiles(_files: string[], _worktreePath: string): Promise<void> {
  // TODO: 实现文件拷贝
  // 可以通过 Tauri fs plugin 或自定义 command 执行
}
