// Settings Feature - Global Settings Types
// 全局设置类型定义
// 统一使用 HTTP API 调用后端，确保 Web、Desktop、Mobile 三端功能一致

import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

// ============ HTTP API 调用 ============

async function httpRequest<T>(endpoint: string, method: 'GET' | 'PUT', body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
  const response = await fetch(resolveHttpUrl(endpoint), options)

  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text as T
  }
}

// 全局设置
export interface GlobalSettings {
  workspace_dir: string | null
  branch_prefix: string | null
  skills_hub_dir: string | null
}

// 默认设置
export const defaultSettings: GlobalSettings = {
  workspace_dir: null,
  branch_prefix: 'hive-',
  skills_hub_dir: null,
}

// ============ API 函数 ============

/**
 * 获取全局设置
 */
export async function getGlobalSettings(): Promise<GlobalSettings> {
  return httpRequest<GlobalSettings>('/api/settings', 'GET')
}

/**
 * 保存全局设置
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await httpRequest<void>('/api/settings', 'PUT', settings)
}

/**
 * 获取 worktree 目录配置
 */
export async function getWorkspaceDir(): Promise<string | null> {
  return httpRequest<string | null>('/api/settings/workspace', 'GET')
}

/**
 * 设置 worktree 目录配置
 */
export async function setWorkspaceDir(dir: string | null): Promise<void> {
  await httpRequest<void>('/api/settings/workspace', 'PUT', dir)
}
