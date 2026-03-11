// Swarm Config - 蜂群配置读写 API
// 统一使用 HTTP API 调用后端，确保 Web、Desktop、Mobile 三端功能一致
// 种子模式：配置复制后归项目所有，与蜂群完全解耦

import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

// ============ HTTP API 调用 ============

async function httpRequest<T>(endpoint: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
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

// ========== 写入配置 ==========

export interface WriteSwarmConfigRequest {
  repo_path: string
  oh_my_opencode_json?: string
  opencode_json?: string
  claude_md?: string
  agents_md?: string
  swarm_id?: string
  include_template?: boolean
  template_git_url?: string
  template_branch?: string
}

export interface WriteSwarmConfigResult {
  success: boolean
  message: string
  files_written: string[]
  dirs_created: string[]
}

/**
 * 将蜂群配置写入项目目录
 *
 * 种子模式：配置复制后归项目所有
 * - 写入 .opencode/oh-my-opencode.jsonc
 * - 写入 opencode.json（项目根目录）
 * - 写入 CLAUDE.md（根目录）
 * - 写入 AGENTS.md（根目录，可选）
 * - 复制 skills/ 目录
 */
export async function writeSwarmConfigToProject(
  request: WriteSwarmConfigRequest
): Promise<WriteSwarmConfigResult> {
  return httpRequest<WriteSwarmConfigResult>('/api/swarm-config/write', request)
}

// ========== 读取配置 ==========

export interface ProjectConfig {
  oh_my_opencode_json: string | null
  opencode_json: string | null
  claude_md: string | null
  agents_md: string | null
  skills: string[]
  exists: boolean
}

/**
 * 读取项目配置
 *
 * 从项目目录读取配置文件内容
 */
export async function readProjectConfig(
  repoPath: string
): Promise<ProjectConfig> {
  return httpRequest<ProjectConfig>('/api/swarm-config/read', { repoPath })
}

// ========== 保存单个配置文件 ==========

export interface SaveProjectConfigRequest {
  repo_path: string
  config_type: 'oh-my-opencode' | 'opencode' | 'claude-md' | 'agents-md'
  content: string
}

export interface SaveProjectConfigResult {
  success: boolean
  message: string
  file_path: string
}

/**
 * 保存项目配置文件
 *
 * 直接写入项目目录中的配置文件
 */
export async function saveProjectConfigFile(
  request: SaveProjectConfigRequest
): Promise<SaveProjectConfigResult> {
  return httpRequest<SaveProjectConfigResult>('/api/swarm-config/save', request)
}

export interface SyncProjectSkillsRequest {
  repo_path: string
  skills: string[]
}

export interface SyncProjectSkillsResult {
  success: boolean
  message: string
  copied_skills: string[]
}

export async function syncProjectSkills(
  request: SyncProjectSkillsRequest
): Promise<SyncProjectSkillsResult> {
  return httpRequest<SyncProjectSkillsResult>('/api/swarm-config/skills/sync', request)
}

export interface CapabilityScopePayload {
  agent_config?: boolean
  skills?: boolean
  rules?: boolean
  template?: boolean
}

export interface CapabilityOverridesPayload {
  oh_my_opencode_json?: string
  opencode_json?: string
  claude_md?: string
  agents_md?: string
  project_skills?: string[]
  include_template?: boolean
  template_git_url?: string
  template_branch?: string
}

export interface ApplyProjectSwarmConfigRequest {
  swarm_id: string
  capability_scope?: CapabilityScopePayload
  capability_overrides?: CapabilityOverridesPayload
}

export interface ApplyProjectSwarmConfigResult {
  success: boolean
  projectId: string
  projectName: string
  swarmId: string
  bindingId: string
  configWrite: {
    repoPath: string
    filesWritten: string[]
    dirsCreated: string[]
    skillsSync?: {
      requestedSkills: string[]
      copiedSkills: string[]
      missingSkills: string[]
    } | null
    capabilityScope: {
      agentConfig: boolean
      skills: boolean
      rules: boolean
      template: boolean
    }
  }
}

export async function applyProjectSwarmConfig(
  projectId: string,
  request: ApplyProjectSwarmConfigRequest
): Promise<ApplyProjectSwarmConfigResult> {
  return httpRequest<ApplyProjectSwarmConfigResult>(`/api/projects/${projectId}/swarm-config/apply`, request)
}

// ========== 辅助函数 ==========

/**
 * 获取配置下载内容（用于前端显示预览）
 */
export function getConfigDownloadContent(
  ohMyOpencodeJson?: string,
  opencodeJson?: string,
  claudeMd?: string,
  agentsMd?: string
): Array<{ filename: string; content: string }> {
  const files: Array<{ filename: string; content: string }> = []

  if (ohMyOpencodeJson) {
    files.push({
      filename: '.opencode/oh-my-opencode.jsonc',
      content: ohMyOpencodeJson,
    })
  }

  if (opencodeJson) {
    files.push({
      filename: 'opencode.json',
      content: opencodeJson,
    })
  }

  if (claudeMd) {
    files.push({
      filename: 'CLAUDE.md',
      content: claudeMd,
    })
  }

  if (agentsMd) {
    files.push({
      filename: 'AGENTS.md',
      content: agentsMd,
    })
  }

  return files
}
