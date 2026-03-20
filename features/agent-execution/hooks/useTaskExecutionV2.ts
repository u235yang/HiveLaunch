// F3: useTaskExecutionV2 - 任务执行 Hook (V2 - vibe-kanban 架构)
// 使用 vibe-kanban 的 session-based 架构
// 与 V1 的主要区别：
// 1. 使用 useExecutionProcesses 替代 useAgentStream
// 2. Session 创建 + followUp 在一个原子操作中完成
// 3. WebSocket 使用 JSON Patch 格式

import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorkspace, WorkspaceInfo, WorkspaceConfig } from '../lib/workspace-creator'
import { pickRecoverySession } from '../lib/session-recovery'
import { useExecutionProcesses } from './useExecutionProcesses'
import { useCreateSession } from './useCreateSession'
import { sessionsApi, executionProcessesApi } from '@/features/agent-execution/api/sessions'
import { resolveHttpUrl } from '../lib/api-config'
import type { ExecutionProcess, BaseCodingAgent } from '@/features/agent-execution/types/execution-process'

export interface TaskExecutionV2State {
  workspace: WorkspaceInfo | null
  sessionId: string | null
  isInitialized: boolean
  isStarting: boolean
}

export interface UseTaskExecutionV2Options {
  taskId: string
  taskDescription: string
  agentCli: BaseCodingAgent
  agentId?: string // 🔹 用户选择的 agent ID（优先使用)
  modelId?: string
  repoPath: string
  targetBranch: string
  initialBranch?: string
  setupScript?: string
  copyFiles?: string[]
  workspaceId?: string
  activeSessionId?: string
  workspaceRole?: 'primary' | 'retry' | 'fork'
  sourceWorkspaceId?: string
  taskType?: 'normal' | 'direct'
  directBranch?: string
  imageIds?: string[]
  onError?: (error: Error) => void
  onComplete?: () => void
}

export interface UseTaskExecutionV2Return {
  // 状态
  workspace: WorkspaceInfo | null
  sessionId: string | null
  isInitialized: boolean
  isStarting: boolean
  isExecuting: boolean
  isConnected: boolean
  executionProcesses: ExecutionProcess[]
  entries: never[] // entries 现在通过 ConversationHistoryEntries 组件获取
  error: Error | null

  // 操作
  sendMessage: (message: string, variant?: string | null, imageIds?: string[], modelIdOverride?: string) => Promise<void>
  stopExecution: () => Promise<void>
  restartExecution: () => Promise<void>
  prepareNewSessionInWorkspace: () => Promise<void>
  startExecution: () => Promise<void>
}

// 保存 workspace 到数据库
async function saveWorkspaceToDb(
  taskId: string,
  worktreeInfo: { id: string; branch: string; path: string; baseBranch?: string },
  agentCli: string,
  options?: { role?: 'primary' | 'retry' | 'fork'; sourceWorkspaceId?: string }
): Promise<{ workspaceId: string } | null> {
  try {
    const normalizedWorkspaceId = (worktreeInfo.id || '').trim()
    const normalizedBranch = (
      (typeof worktreeInfo.branch === 'string' && worktreeInfo.branch) ||
      (typeof worktreeInfo.baseBranch === 'string' && worktreeInfo.baseBranch) ||
      'main'
    ).trim()
    const normalizedPath = (worktreeInfo.path || '').trim()
    if (!normalizedWorkspaceId) {
      console.error('[useTaskExecutionV2] saveWorkspaceToDb called with empty workspace id', {
        taskId,
        worktreeInfo,
        agentCli,
      })
    }
    const response = await fetch(resolveHttpUrl(`/api/tasks/${taskId}/workspaces`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 使用与 git worktree 相同的 ID，确保 Rust HTTP Server 能查到
        workspaceId: normalizedWorkspaceId || undefined,
        branch: normalizedBranch,
        role: options?.role,
        sourceWorkspaceId: options?.sourceWorkspaceId,
        baseBranch: worktreeInfo.baseBranch || null,
        agentWorkingDir: normalizedPath,
        agentCli,
      }),
    })

    if (!response.ok) {
      console.error('[useTaskExecutionV2] Failed to save workspace to DB:', await response.text())
      return null
    }

    const workspace = await response.json() as Record<string, unknown>
    const dbWorkspaceId = (
      (typeof workspace.id === 'string' && workspace.id) ||
      (typeof workspace.workspaceId === 'string' && workspace.workspaceId) ||
      (typeof workspace.workspace_id === 'string' && workspace.workspace_id) ||
      ''
    ).trim()
    if (!dbWorkspaceId) {
      console.error('[useTaskExecutionV2] saveWorkspaceToDb response missing workspace id', {
        taskId,
        requestWorkspaceId: normalizedWorkspaceId,
        response: workspace,
      })
      return null
    }
    // 后端应该返回与 worktree 相同的 ID
    return { workspaceId: dbWorkspaceId }
  } catch (error) {
    console.error('[useTaskExecutionV2] Error saving workspace to DB:', error)
    return null
  }
}

/**
 * 任务执行 Hook V2 - 使用 vibe-kanban 架构
 * 
 * 使用流程:
 * 1. 首次发送消息时自动创建 workspace
 * 2. 通过 useCreateSession 创建 session 并发送初始 prompt（原子操作）
 * 3. 后续 follow-up 直接调用 sessionsApi.followUp
 * 4. 使用 useExecutionProcesses 监听执行状态
 */
export function useTaskExecutionV2({
  taskId,
  taskDescription,
  agentCli,
  agentId, // 🔹 用户选择的 agent ID
  modelId,
  repoPath,
  targetBranch,
  initialBranch,
  setupScript,
  copyFiles,
  workspaceId: initialWorkspaceId,
  activeSessionId,
  workspaceRole,
  sourceWorkspaceId,
  taskType,
  directBranch,
  imageIds,
  onError,
  onComplete,
}: UseTaskExecutionV2Options): UseTaskExecutionV2Return {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const isFirstMessageRef = useRef(true)
  const workspaceRef = useRef<WorkspaceInfo | null>(null)
  const initialWorkspaceIdRef = useRef(initialWorkspaceId)
  initialWorkspaceIdRef.current = initialWorkspaceId

  const resetRuntimeState = useCallback(() => {
    isFirstMessageRef.current = true
    workspaceRef.current = null
    setWorkspace(null)
    setSessionId(null)
    setIsInitialized(false)
    setError(null)
  }, [])

  // 使用 useExecutionProcesses hook 监听执行状态
  const {
    executionProcesses,
    isAttemptRunning,
    isLoading,
    isConnected,
    error: streamError,
  } = useExecutionProcesses(sessionId, { showSoftDeleted: true })

  // 使用 useCreateSession hook
  const { createSession, isCreating, error: createError } = useCreateSession()

  const hydrateWorkspaceById = useCallback(async (workspaceId: string): Promise<WorkspaceInfo> => {
    const wsResponse = await fetch(resolveHttpUrl(`/api/workspaces/${workspaceId}`))
    if (!wsResponse.ok) {
      throw new Error('Failed to fetch workspace details')
    }
    const wsData = await wsResponse.json() as Record<string, unknown>
    return {
      id: String(wsData.id || workspaceId),
      branch: String(
        wsData.branch ||
        wsData.baseBranch ||
        wsData.base_branch ||
        'main'
      ),
      path: String(
        wsData.agentWorkingDir ||
        wsData.agent_working_dir ||
        ''
      ),
      baseBranch: typeof wsData.baseBranch === 'string'
        ? wsData.baseBranch
        : (typeof wsData.base_branch === 'string' ? wsData.base_branch : undefined),
      createdAt: String(wsData.createdAt || wsData.created_at || new Date().toISOString()),
    }
  }, [])

  // 当 execution processes 变化时检查是否完成
  useEffect(() => {
    if (!isAttemptRunning && executionProcesses.length > 0) {
      const lastProcess = executionProcesses[executionProcesses.length - 1]
      if (lastProcess.status === 'completed' || lastProcess.status === 'failed') {
        onComplete?.()
      }
    }
  }, [isAttemptRunning, executionProcesses, onComplete])

  // Task 切换时必须重置运行时状态，避免会话串用到新任务。
  useEffect(() => {
    if (!taskId) {
      resetRuntimeState()
      return
    }
    resetRuntimeState()
  }, [taskId, resetRuntimeState])

  // 选择已有 workspace 时，自动恢复该 workspace 最近一次会话。
  useEffect(() => {
    console.log('[useTaskExecutionV2] Workspace recovery effect:', {
      taskId,
      initialWorkspaceId,
      activeSessionId,
    })

    if (!taskId || !initialWorkspaceId) {
      console.log('[useTaskExecutionV2] Skipping recovery: missing taskId or initialWorkspaceId')
      return
    }

    let cancelled = false
    setIsStarting(true)
    ;(async () => {
      try {
        console.log('[useTaskExecutionV2] Fetching workspace:', initialWorkspaceId)
        if (cancelled) return

        const existingWorkspace = await hydrateWorkspaceById(initialWorkspaceId)
        if (cancelled) return
        workspaceRef.current = existingWorkspace
        setWorkspace(existingWorkspace)

        // 优先恢复 task 显式记录的 active session；若不存在，再回退到该 workspace 的最近 session。
        console.log('[useTaskExecutionV2] Fetching sessions for workspace:', initialWorkspaceId)
        const sessions = await sessionsApi.getByWorkspace(initialWorkspaceId)
        if (cancelled) return

        console.log('[useTaskExecutionV2] Found sessions:', sessions.length)

        if (sessions.length > 0) {
          const recoveredSession = pickRecoverySession(sessions, activeSessionId)
          if (!recoveredSession) {
            setSessionId(null)
            isFirstMessageRef.current = true
            setIsInitialized(true)
            return
          }
          console.log('[useTaskExecutionV2] Setting sessionId to:', recoveredSession.id)
          setSessionId(recoveredSession.id)
          isFirstMessageRef.current = false
        } else {
          // 没有 session，但 workspace 存在
          // 标记为需要创建新 session，但复用现有 workspace
          console.log('[useTaskExecutionV2] No sessions found, keeping sessionId null')
          setSessionId(null)
          isFirstMessageRef.current = true
        }

        setIsInitialized(true)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        console.error('[useTaskExecutionV2] error:', e)
        setError(e)
        onError?.(e)
      } finally {
        if (!cancelled) {
          setIsStarting(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeSessionId, hydrateWorkspaceById, initialWorkspaceId, onError, taskId])

  // 当 workspace 改变时清理状态 - 只有在 workspace 从有值变为空时才清理
  const prevWorkspaceRef = useRef(workspace)
  useEffect(() => {
    const prevWorkspace = prevWorkspaceRef.current
    // 只有当 workspace 从有值变为空时才清理 sessionId
    if (prevWorkspace && !workspace) {
      setSessionId(null)
      setIsInitialized(false)
    }
    prevWorkspaceRef.current = workspace
  }, [workspace])

  // 错误处理
  useEffect(() => {
    if (streamError) {
      setError(new Error(streamError))
      onError?.(new Error(streamError))
    }
    if (createError) {
      setError(new Error(createError))
      onError?.(new Error(createError))
    }
  }, [streamError, createError, onError])

  // 初始化 workspace
  const initializeWorkspace = useCallback(async (): Promise<WorkspaceInfo> => {
    if (workspaceRef.current?.id?.trim()) {
      return workspaceRef.current
    }
    workspaceRef.current = null
    if (!taskId.trim()) {
      throw new Error('Cannot initialize workspace: task id is empty')
    }
    if (!repoPath.trim()) {
      throw new Error('Cannot initialize workspace: repo path is empty')
    }

    setIsStarting(true)
    try {
      // 处理直接任务：使用主仓库路径，不创建 worktree
      if (taskType === 'direct' && directBranch) {
        console.log('[useTaskExecutionV2] Direct task mode:', { directBranch, repoPath })
        let directWorkspace: WorkspaceInfo = {
          id: `direct-${taskId.slice(-8)}`,
          branch: directBranch,
          path: repoPath,  // 使用主仓库路径
          baseBranch: directBranch,
          createdAt: new Date().toISOString(),
        }

        // 保存到数据库
        const dbWorkspace = await saveWorkspaceToDb(taskId, directWorkspace, agentCli, {
          role: workspaceRole || 'primary',
          sourceWorkspaceId,
        })
        if (!dbWorkspace) {
          throw new Error('Failed to save workspace to database')
        }
        if (dbWorkspace.workspaceId !== directWorkspace.id) {
          directWorkspace = {
            ...directWorkspace,
            id: dbWorkspace.workspaceId,
          }
        }

        workspaceRef.current = directWorkspace
        setWorkspace(directWorkspace)
        setIsInitialized(true)
        return directWorkspace
      }

      // 普通任务：创建 worktree
      console.log('[useTaskExecutionV2] initializeWorkspace:', { initialBranch, targetBranch })
      const branchForWorkspace = initialBranch || targetBranch
      console.log('[useTaskExecutionV2] branchForWorkspace:', branchForWorkspace)

      const config: WorkspaceConfig = {
        taskId,
        repoPath,
        targetBranch: branchForWorkspace,
        setupScript,
        copyFiles,
      }
      console.log('[useTaskExecutionV2] config.targetBranch:', config.targetBranch)

      const newWorkspace = await createWorkspace(config)

      // 保存到数据库，确保数据库中存储的 ID 与 worktree ID 一致
      const dbWorkspace = await saveWorkspaceToDb(taskId, newWorkspace, agentCli, {
        role: workspaceRole || 'primary',
        sourceWorkspaceId,
      })
      if (!dbWorkspace) {
        throw new Error('Failed to save workspace to database')
      }
      const resolvedWorkspaceId = (
        (newWorkspace.id || '').trim() ||
        (dbWorkspace.workspaceId || '').trim()
      )
      if (!resolvedWorkspaceId) {
        console.error('[useTaskExecutionV2] initializeWorkspace missing workspace id after creation', {
          taskId,
          repoPath,
          targetBranch,
          initialBranch,
          taskType,
          directBranch,
          newWorkspace,
          dbWorkspace,
        })
        throw new Error('Workspace created but id is empty')
      }
      const normalizedWorkspace = {
        ...newWorkspace,
        id: resolvedWorkspaceId,
      }

      // 验证数据库 ID 与 worktree ID 一致（用于调试）
      if ((dbWorkspace.workspaceId || '').trim() !== resolvedWorkspaceId) {
        console.warn('[useTaskExecutionV2] Workspace ID mismatch:', {
          worktreeId: newWorkspace.id,
          dbId: dbWorkspace.workspaceId,
          resolvedWorkspaceId,
        })
      }

      workspaceRef.current = normalizedWorkspace
      setWorkspace(normalizedWorkspace)
      setIsInitialized(true)

      return normalizedWorkspace
    } finally {
      setIsStarting(false)
    }
  }, [taskId, repoPath, targetBranch, initialBranch, setupScript, copyFiles, agentCli, workspaceRole, sourceWorkspaceId, taskType, directBranch])

  // 发送消息
  const sendMessage = useCallback(
    async (message: string, variant: string | null = null, messageImageIds: string[] = [], modelIdOverride?: string) => {
      if (!message.trim() && messageImageIds.length === 0) return

      try {
        setError(null)

        const imageIdsToSend = messageImageIds.length > 0 ? messageImageIds : (imageIds ?? [])
        const effectiveModelId = modelIdOverride || modelId

        if (isFirstMessageRef.current) {
          // 首次发送：创建 session + 发送 prompt
          isFirstMessageRef.current = false
          setIsStarting(true)

          // 获取 workspace：如果已存在则复用，否则创建新的
          let workspaceToUse = workspaceRef.current
          if (!workspaceToUse?.id?.trim()) {
            workspaceRef.current = null
            workspaceToUse = await initializeWorkspace()
          }
          const fallbackWorkspaceId = (initialWorkspaceIdRef.current || '').trim()
          const ensuredWorkspaceId = (workspaceToUse.id || '').trim() || fallbackWorkspaceId
          if (!ensuredWorkspaceId) {
            workspaceRef.current = null
            workspaceToUse = await initializeWorkspace()
          }
          const recoveredWorkspaceId =
            (workspaceToUse.id || '').trim() || (initialWorkspaceIdRef.current || '').trim()
          if (!recoveredWorkspaceId) {
            console.error('[useTaskExecutionV2] Failed to initialize workspace id', {
              taskId,
              initialWorkspaceId: initialWorkspaceIdRef.current,
              workspaceToUse,
              workspaceRefCurrent: workspaceRef.current,
              repoPath,
              targetBranch,
              initialBranch,
              taskType,
              directBranch,
              agentCli,
            })
            throw new Error('Failed to initialize workspace id')
          }
          if (workspaceToUse.id !== recoveredWorkspaceId) {
            workspaceToUse = {
              ...workspaceToUse,
              id: recoveredWorkspaceId,
            }
            workspaceRef.current = workspaceToUse
            setWorkspace(workspaceToUse)
          }

          // 使用 useCreateSession 创建 session 并发送初始 prompt
          const session = await createSession({
            workspaceId: recoveredWorkspaceId,
            workingDir: workspaceToUse.path,
            prompt: message,
            variant,
            executor: agentCli, // 🔹 保持使用 agentCli 作为 executor
            agentId, // 🔹 传递 agentId 作为额外配置
            modelId: effectiveModelId,
            imageIds: imageIdsToSend,
          })

          setSessionId(session.id)
        } else {
          // 后续发送：follow-up
          if (!sessionId) {
            throw new Error('No active session')
          }

        await sessionsApi.followUp(sessionId, {
            prompt: message,
            executorProfileId: { executor: agentCli, variant }, // 🔹 保持使用 agentCli
            agent: agentId, // 🔹 传递 agent 作为额外配置
            model: effectiveModelId,
            imageIds: imageIdsToSend,
            retryProcessId: null,
            forceWhenDirty: null,
            performGitReset: null,
        })

        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error('[useTaskExecutionV2] Error:', error)
        setError(error)
        onError?.(error)

        if (isFirstMessageRef.current === false && !sessionId) {
          isFirstMessageRef.current = true
        }
        throw error
      } finally {
        setIsStarting(false)
      }
    },
    [agentCli, initializeWorkspace, sessionId, createSession, onError, modelId, imageIds]
  )

  // 停止执行
  const stopExecution = useCallback(async () => {
    if (!sessionId) return

    try {
      const runningProcess = executionProcesses.find(p => p.status === 'running')
      if (runningProcess) {
        await executionProcessesApi.stop(runningProcess.id)
      }
    } catch (err) {
      console.error('[useTaskExecutionV2] Failed to stop execution:', err)
    }
  }, [sessionId, executionProcesses])

  // 重新开始
  const restartExecution = useCallback(async () => {
    resetRuntimeState()
  }, [resetRuntimeState])

  const prepareNewSessionInWorkspace = useCallback(async () => {
    const workspaceId = (workspaceRef.current?.id || initialWorkspaceIdRef.current || '').trim()
    if (!workspaceId) {
      throw new Error('No workspace available for retry session')
    }

    let existingWorkspace = workspaceRef.current
    if (!existingWorkspace || existingWorkspace.id !== workspaceId) {
      existingWorkspace = await hydrateWorkspaceById(workspaceId)
    }

    workspaceRef.current = existingWorkspace
    setWorkspace(existingWorkspace)
    setSessionId(null)
    setIsInitialized(true)
    setError(null)
    isFirstMessageRef.current = true
  }, [hydrateWorkspaceById])

  // 自动启动执行
  const autoStartExecution = useCallback(async () => {
    if (taskDescription) {
      await sendMessage(taskDescription)
    }
  }, [taskDescription, sendMessage])

  return {
    workspace,
    sessionId,
    isInitialized,
    isStarting: isStarting || isCreating,
    isExecuting: isAttemptRunning,
    isConnected,
    executionProcesses,
    entries: [],  // entries managed by ConversationHistoryEntries component
    error: error || (createError ? new Error(createError) : null),
    sendMessage,
    stopExecution,
    restartExecution,
    prepareNewSessionInWorkspace,
    startExecution: autoStartExecution,
  }
}
