/**
 * Sessions API - adapted from vibe-kanban
 * Handles session creation and follow-up messages
 */

import { resolveHttpUrl, resolveRealtimeUrl } from '@/features/agent-execution/lib/api-config'
import type {
  Session,
  ExecutionProcess,
  CreateFollowUpAttempt,
} from '@/features/agent-execution/types/execution-process'

export class ApiError extends Error {
  public status?: number
  public errorData?: unknown

  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response,
    errorData?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = statusCode
    this.errorData = errorData
  }
}

const makeRequest = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers ?? {})
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

export type ApiResponse<T> = {
  success: boolean
  data: T | null
  message: string | null
}

const handleApiResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`
    const rawText = await response.text()

    if (rawText) {
      try {
        const errorData = JSON.parse(rawText)
        if (typeof errorData?.message === 'string' && errorData.message.trim()) {
          errorMessage = errorData.message
        } else if (typeof errorData?.error === 'string' && errorData.error.trim()) {
          errorMessage = errorData.error
        }
      } catch {
        errorMessage = rawText.trim() || response.statusText || errorMessage
      }
    } else {
      errorMessage = response.statusText || errorMessage
    }

    console.error('[API Error]', {
      message: errorMessage,
      status: response.status,
      endpoint: response.url,
    })
    throw new ApiError(errorMessage, response.status, response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const result: ApiResponse<T> = await response.json()

  if (!result.success) {
    throw new ApiError(
      result.message || 'API request failed',
      response.status,
      response,
      result.data
    )
  }

  return result.data as T
}

/**
 * Sessions API
 */
export const sessionsApi = {
  /**
   * Get sessions by workspace ID
   */
  getByWorkspace: async (workspaceId: string): Promise<Session[]> => {
    const response = await makeRequest(
      resolveHttpUrl(`/api/sessions?workspace_id=${workspaceId}`)
    )
    return handleApiResponse<Session[]>(response)
  },

  /**
   * Get session by ID
   */
  getById: async (sessionId: string): Promise<Session> => {
    const response = await makeRequest(resolveHttpUrl(`/api/sessions/${sessionId}`))
    return handleApiResponse<Session>(response)
  },

  /**
   * Create a new session
   */
  create: async (data: {
    workspace_id?: string
    workspaceId?: string
    executor?: string
    working_dir?: string
    workingDir?: string
    model?: string
    model_id?: string
    modelId?: string
  }): Promise<Session> => {
    const workspace_id = (data.workspace_id || data.workspaceId || '').trim()
    const executor = data.executor?.trim()
    const working_dir = (data.working_dir || data.workingDir || '').trim()
    const model = (data.model || data.model_id || data.modelId || '').trim()
    if (!workspace_id) {
      throw new ApiError('workspace_id is required', 400)
    }
    const payload = {
      workspace_id,
      executor: executor || undefined,
      working_dir: working_dir || undefined,
      model: model || undefined,
    }
    const response = await makeRequest(resolveHttpUrl('/api/sessions'), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return handleApiResponse<Session>(response)
  },

  /**
   * Send follow-up message to a session
   */
  followUp: async (
    sessionId: string,
    data: CreateFollowUpAttempt
  ): Promise<ExecutionProcess> => {
    const response = await makeRequest(
      resolveHttpUrl(`/api/sessions/${sessionId}/follow-up`),
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    return handleApiResponse<ExecutionProcess>(response)
  },

  /**
   * Reset session to a previous process
   */
  reset: async (
    sessionId: string,
    data: { process_id: string; force_when_dirty?: boolean; perform_git_reset?: boolean }
  ): Promise<void> => {
    const response = await makeRequest(
      resolveHttpUrl(`/api/sessions/${sessionId}/reset`),
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    return handleApiResponse<void>(response)
  },
}

/**
 * Execution Processes API
 */
export const executionProcessesApi = {
  /**
   * Get execution processes by session ID from DB.
   */
  getBySession: async (
    sessionId: string,
    opts?: { showSoftDeleted?: boolean }
  ): Promise<ExecutionProcess[]> => {
    const params = new URLSearchParams()
    if (opts?.showSoftDeleted !== undefined) {
      params.set('show_soft_deleted', String(opts.showSoftDeleted))
    }
    const query = params.toString()
    const response = await makeRequest(
      resolveHttpUrl(`/api/sessions/${sessionId}/processes${query ? `?${query}` : ''}`)
    )
    return handleApiResponse<ExecutionProcess[]>(response)
  },

  /**
   * Get execution process details
   */
  getDetails: async (processId: string): Promise<ExecutionProcess> => {
    const response = await makeRequest(
      resolveHttpUrl(`/api/execution-processes/${processId}`)
    )
    return handleApiResponse<ExecutionProcess>(response)
  },

  /**
   * Stop an execution process
   */
  stop: async (processId: string): Promise<void> => {
    const response = await makeRequest(
      resolveHttpUrl(`/api/execution-processes/${processId}/stop`),
      {
        method: 'POST',
      }
    )
    return handleApiResponse<void>(response)
  },

  /**
   * Get WebSocket URL for streaming execution processes by session
   */
  getSessionStreamUrl: (
    sessionId: string,
    opts?: { showSoftDeleted?: boolean }
  ): string => {
    const params = new URLSearchParams({ session_id: sessionId })
    if (opts?.showSoftDeleted !== undefined) {
      params.set('show_soft_deleted', String(opts.showSoftDeleted))
    }
    // Use WebSocket endpoint - always use WS_BASE for WebSocket connections
    return resolveRealtimeUrl(`/api/execution-processes/stream/session/ws?${params.toString()}`)
  },
}
