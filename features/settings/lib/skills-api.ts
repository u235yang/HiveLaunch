import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface InstalledSkill {
  name: string
  path: string
}

export interface SkillsHubStatus {
  hub_dir: string
  exists: boolean
  lock_file_exists: boolean
  installed_skills: InstalledSkill[]
}

export interface SkillsCommandResult {
  success: boolean
  stdout: string
  stderr: string
  exit_code: number | null
}

export interface SearchSkillResult {
  owner: string
  repo: string
  skill: string
  installs: number
}

export interface SkillsSearchResult {
  success: boolean
  results: SearchSkillResult[]
  error?: string
}

async function request<T>(endpoint: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await fetch(resolveHttpUrl(endpoint), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const raw = await response.text()
  let parsed: ApiResponse<T> | null = null
  try {
    parsed = JSON.parse(raw) as ApiResponse<T>
  } catch {
    if (!response.ok) {
      throw new Error(raw || `Request failed with status ${response.status}`)
    }
  }

  if (!response.ok) {
    throw new Error(parsed?.message || raw || `Request failed with status ${response.status}`)
  }

  if (parsed && parsed.success === false) {
    throw new Error(parsed.message || 'Request failed')
  }

  if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
    return parsed.data
  }

  return raw as T
}

export async function getSkillsHubStatus(): Promise<SkillsHubStatus> {
  return request<SkillsHubStatus>('/api/settings/skills/status', 'GET')
}

export async function findSkills(query: string, limit?: number): Promise<SkillsSearchResult> {
  return request<SkillsSearchResult>('/api/settings/skills/find', 'POST', { query, limit })
}

export async function listSkillsFromRepo(repo: string): Promise<SkillsCommandResult> {
  return request<SkillsCommandResult>('/api/settings/skills/repo-list', 'POST', { repo })
}

export async function installSkill(
  repo: string,
  skill: string,
  agent: string
): Promise<SkillsCommandResult> {
  return request<SkillsCommandResult>('/api/settings/skills/install', 'POST', {
    repo,
    skill,
    agent,
  })
}

export async function removeSkill(skill: string): Promise<SkillsCommandResult> {
  return request<SkillsCommandResult>('/api/settings/skills/remove', 'POST', { skill })
}

export async function updateSkills(): Promise<SkillsCommandResult> {
  return request<SkillsCommandResult>('/api/settings/skills/update', 'POST')
}
