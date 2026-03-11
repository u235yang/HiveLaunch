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
  const baseBranch = config.targetBranch || 'main'
  console.log('[workspace-creator] baseBranch:', baseBranch)

  // 统一使用 HTTP API 创建 workspace
  const worktreeInfo = await httpRequest<WorktreeInfo>('/api/workspaces', {
    repo_path: config.repoPath,
    branch: worktreeBranch,
    base_branch: baseBranch,
  })

  // 如果有 setup 脚本，运行它
  if (config.setupScript) {
    await runSetupScript(config.setupScript, worktreeInfo.path)
  }

  // 如果有需要拷贝的文件
  if (config.copyFiles && config.copyFiles.length > 0) {
    await copyFiles(config.copyFiles, worktreeInfo.path)
  }

  return {
    id: worktreeInfo.id,
    branch: worktreeInfo.branch,
    path: worktreeInfo.path,
    baseBranch: worktreeInfo.baseBranch || baseBranch,  // 返回目标分支
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
