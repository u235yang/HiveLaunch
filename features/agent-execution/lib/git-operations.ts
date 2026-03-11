// F3: Git Operations Service
// 统一使用 HTTP API 调用后端，确保 Web、Desktop、Mobile 三端功能一致

import { resolveHttpUrl } from './api-config'

// ============ 类型定义 ============

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  additions: number
  deletions: number
  diff?: string
}

/// 文件状态类型
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'

export interface BranchStatus {
  commits_ahead: number
  commits_behind: number
  has_uncommitted_changes: boolean
  conflicted_files: string[]
  current_branch: string
  is_rebase_in_progress: boolean
  is_merge_in_progress: boolean
  conflict_op: string | null
}

export interface CommitInfo {
  hash: string
  short_hash: string
  message: string
  author: string
  date: string
}

export interface PushResult {
  success: boolean
  message: string
  remote_url?: string
}

export interface PullRequestInfo {
  url: string
  number?: number
  title?: string
}

/// Commit 结果
export interface CommitResult {
  success: boolean
  message: string
  hash?: string
}

/// 分支信息
export interface GitBranch {
  name: string
  is_current: boolean
  is_remote: boolean
}

export interface WorktreeFileEntry {
  name: string
  path: string
  isDir: boolean
  size: number | null
  modifiedAt: string | null
  isPreviewable: boolean
}

export interface WorktreeFilePreview {
  path: string
  content: string | null
  truncated: boolean
  isBinary: boolean
  size: number
  language: string | null
}

// ============ HTTP API 调用 ============

async function httpRequest<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(resolveHttpUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text as T
  }
}

async function strictHttpRequest<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(resolveHttpUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorText = await response.text()
    const error = new Error(errorText || `Request failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return response.json() as Promise<T>
}

function normalizeBranchStatus(raw: unknown): BranchStatus {
  const data = typeof raw === 'object' && raw !== null ? (raw as Partial<BranchStatus>) : {}
  return {
    commits_ahead: typeof data.commits_ahead === 'number' ? data.commits_ahead : 0,
    commits_behind: typeof data.commits_behind === 'number' ? data.commits_behind : 0,
    has_uncommitted_changes:
      typeof data.has_uncommitted_changes === 'boolean' ? data.has_uncommitted_changes : false,
    conflicted_files: Array.isArray(data.conflicted_files)
      ? data.conflicted_files.filter((item): item is string => typeof item === 'string')
      : [],
    current_branch: typeof data.current_branch === 'string' ? data.current_branch : '',
    is_rebase_in_progress: typeof data.is_rebase_in_progress === 'boolean' ? data.is_rebase_in_progress : false,
    is_merge_in_progress: typeof data.is_merge_in_progress === 'boolean' ? data.is_merge_in_progress : false,
    conflict_op: typeof data.conflict_op === 'string' ? data.conflict_op : null,
  }
}

// ============ Git 操作 API ============

/**
 * 获取 Worktree 的文件变更
 */
export async function getDiff(worktreePath: string): Promise<FileDiff[]> {
  return httpRequest<FileDiff[]>('/api/git/diff', { worktreePath })
}

/**
 * 获取分支状态
 */
export async function getBranchStatus(
  worktreePath: string,
  targetBranch: string
): Promise<BranchStatus> {
  const raw = await httpRequest<unknown>('/api/git/branch-status', { worktreePath, targetBranch })
  return normalizeBranchStatus(raw)
}

/**
 * Push 到远程仓库
 */
export async function push(
  worktreePath: string,
  remote: string = 'origin',
  branch: string
): Promise<PushResult> {
  return httpRequest<PushResult>('/api/git/push', { worktreePath, remote, branch, force: false })
}

/**
 * 创建 Pull Request
 */
export async function createPullRequest(
  worktreePath: string,
  title: string,
  body: string | undefined,
  baseBranch: string,
  headBranch: string
): Promise<PullRequestInfo> {
  return httpRequest<PullRequestInfo>('/api/git/pr', {
    worktreePath,
    title,
    body,
    baseBranch,
    headBranch,
  })
}

/**
 * Rebase 到目标分支
 */
export async function rebase(
  worktreePath: string,
  targetBranch: string
): Promise<void> {
  return httpRequest<void>('/api/git/rebase', { worktreePath, targetBranch })
}

/**
 * 中止 Rebase
 */
export async function abortRebase(worktreePath: string): Promise<void> {
  return httpRequest<void>('/api/git/abort-rebase', { worktreePath })
}

/**
 * 继续 Rebase
 */
export async function continueRebase(worktreePath: string): Promise<void> {
  return httpRequest<void>('/api/git/continue-rebase', { worktreePath })
}

/**
 * Merge 到目标分支
 */
export async function merge(
  worktreePath: string,
  targetBranch: string
): Promise<void> {
  return httpRequest<void>('/api/git/merge', { worktreePath, targetBranch })
}

/**
 * 获取最近的 commits
 */
export async function getCommits(
  worktreePath: string,
  count: number = 10
): Promise<CommitInfo[]> {
  return httpRequest<CommitInfo[]>('/api/git/commits', { worktreePath, count })
}

/**
 * 提交当前变更
 */
export async function commit(
  worktreePath: string,
  message: string
): Promise<CommitResult> {
  return httpRequest<CommitResult>('/api/git/commit', { worktreePath, message })
}

/**
 * 获取当前分支名
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
  const status = await getBranchStatus(worktreePath, '')
  return status.current_branch
}

/**
 * 列出所有分支
 */
export async function listBranches(worktreePath: string): Promise<GitBranch[]> {
  const response = await fetch(
    resolveHttpUrl(`/api/git/branches?path=${encodeURIComponent(worktreePath)}`)
  )
  return response.json()
}

/**
 * Force Push 到远程仓库
 */
export async function forcePush(
  worktreePath: string,
  remote: string = 'origin',
  branch: string
): Promise<PushResult> {
  return httpRequest<PushResult>('/api/git/push', { worktreePath, remote, branch, force: true })
}

/**
 * 中止 Merge
 */
export async function abortMerge(worktreePath: string): Promise<void> {
  return httpRequest<void>('/api/git/abort-merge', { worktreePath })
}

/**
 * 检测是否在 Merge 中
 */
export async function isMergeInProgress(worktreePath: string): Promise<boolean> {
  const status = await getBranchStatus(worktreePath, '')
  return status.is_merge_in_progress || false
}

export async function listWorktreeFiles(
  worktreePath: string,
  path: string = ''
): Promise<WorktreeFileEntry[]> {
  return strictHttpRequest<WorktreeFileEntry[]>('/api/worktree/files', {
    worktreePath,
    path,
  })
}

export async function previewWorktreeFile(
  worktreePath: string,
  path: string,
  maxBytes: number = 200_000
): Promise<WorktreeFilePreview> {
  return strictHttpRequest<WorktreeFilePreview>('/api/worktree/file-preview', {
    worktreePath,
    path,
    maxBytes,
  })
}

// ============ 辅助函数 ============

/**
 * 解析 Git 远程 URL 获取仓库信息
 */
export function parseRemoteUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  return null
}

/**
 * 生成 PR 描述（从 commits 中）
 */
export async function generatePRDescription(
  worktreePath: string,
  _baseBranch: string
): Promise<string> {
  try {
    const commits = await getCommits(worktreePath, 20)

    // 过滤出当前分支的 commits（简单实现）
    const relevantCommits = commits.slice(0, 10)

    if (relevantCommits.length === 0) {
      return 'No changes detected.'
    }

    const summary = relevantCommits
      .map((c) => `- ${c.message}`)
      .join('\n')

    return `## Changes\n\n${summary}`
  } catch {
    return '## Changes\n\n(Unable to generate summary)'
  }
}

/**
 * 一键创建 PR
 */
export async function quickCreatePR(
  worktreePath: string,
  branch: string,
  targetBranch: string
): Promise<PullRequestInfo> {
  // 先 push
  const pushResult = await push(worktreePath, 'origin', branch)
  if (!pushResult.success) {
    throw new Error(`Push failed: ${pushResult.message}`)
  }

  // 生成描述
  const body = await generatePRDescription(worktreePath, targetBranch)

  // 获取第一个 commit message 作为 title
  const commits = await getCommits(worktreePath, 1)
  const title = commits[0]?.message || `Merge ${branch}`

  // 创建 PR
  return createPullRequest(worktreePath, title, body, targetBranch, branch)
}
