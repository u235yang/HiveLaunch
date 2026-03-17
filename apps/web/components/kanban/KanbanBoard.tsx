'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  TouchSensor,
} from '@dnd-kit/core'
import { ArrowLeft, CheckSquare, GitBranch, Layers3, Trash2, SquareArrowOutUpRight, X, Zap } from 'lucide-react'
import { KanbanColumn } from './KanbanColumn'
import { Task, TaskStatus, DragOverlayCard } from './TaskCard'
import TaskDetailLayout from '@/features/kanban/ui/TaskDetailLayout'
import TaskPanel, { WorkspaceInfo } from '@/features/kanban/ui/TaskDetailPanel/TaskPanel'
import AttemptPanel from '@/features/kanban/ui/TaskDetailPanel/AttemptPanel'
import { useTaskExecutionV2 } from '@/features/agent-execution/hooks'
import { WysiwygFollowUpInput, ConversationHistoryEntries, GitPanel, WorktreeFilePreviewPane } from '@/features/agent-execution/ui'
import { getTransportSnapshot, resolveHttpUrl } from '@/features/agent-execution/lib/api-config'
import { useProjectStore, useTaskStore } from '@/features/shared/store'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'
import { useMobile } from '@/hooks/use-mobile'
import { Tabs, TabsList, TabsTrigger, TabsContent, Switch } from '@shared/ui'
import { cn } from '@/lib/utils'
import type { BaseCodingAgent } from '@shared/types'
import type { BaseCodingAgent as ExecutionAgentCli } from '@/features/agent-execution/types/execution-process'

// ==================== Column Order ====================

const columnOrder: TaskStatus[] = ['todo', 'inprogress', 'pending', 'done', 'cancelled']

const normalizeTaskAgentCli = (agentCli: string | undefined): BaseCodingAgent => {
  if (!agentCli) return 'OPENCODE'
  const normalized = agentCli.toUpperCase().replace(/-/g, '_')
  if (normalized === 'CLAUDE') return 'CLAUDE_CODE'
  switch (normalized) {
    case 'OPENCODE':
    case 'CLAUDE_CODE':
    case 'CURSOR':
    case 'QWEN':
    case 'COPILOT':
    case 'DROID':
    case 'AMP':
    case 'GEMINI':
      return normalized
    default:
      return 'OPENCODE'
  }
}

const LAST_MODEL_PREF_STORAGE_KEY = 'bee:kanban:last-model-pref:v1'

const getModelPreferenceScopeKey = (projectId: string, executor: string): string =>
  `${projectId}::${executor}`

const readScopedModelPreference = (projectId: string, executor: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LAST_MODEL_PREF_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const scoped = (parsed as Record<string, unknown>)[getModelPreferenceScopeKey(projectId, executor)]
    return typeof scoped === 'string' && scoped.trim() ? scoped : null
  } catch {
    return null
  }
}

const writeScopedModelPreference = (projectId: string, executor: string, modelId: string): void => {
  if (typeof window === 'undefined') return
  if (!modelId.trim()) return
  try {
    const raw = window.localStorage.getItem(LAST_MODEL_PREF_STORAGE_KEY)
    const parsed: Record<string, string> = raw
      ? JSON.parse(raw) as Record<string, string>
      : {}
    parsed[getModelPreferenceScopeKey(projectId, executor)] = modelId
    window.localStorage.setItem(LAST_MODEL_PREF_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    return
  }
}

// ==================== Component ====================

interface KanbanBoardProps {
  projectId?: string
}

interface SwarmBinding {
  id: string
  swarmTemplateId: string
  isActive: boolean
  swarm: {
    id: string
    name: string
    cli: string
    defaultModelId?: string | null
  }
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const locale = useLocale()
  const t = useTranslations('kanbanBoard')
  const tHeader = useTranslations('kanbanHeader')
  const tColumn = useTranslations('kanbanColumn')
  const tTaskDetail = useTranslations('taskDetailPanel')
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>()
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(projectId)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)

  // 真实数据状态 - 直接使用 workspaces 数据
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])

  // 选中的 workspace 详情（用于 GitPanel 和历史加载）
  const [selectedWorkspace, setSelectedWorkspace] = useState<{
    id: string
    branch: string
    baseBranch?: string | null
    agentWorkingDir: string | null
  } | null>(null)

  // 立即执行标记：新创建任务后需要立即启动执行
  const pendingExecutionRef = useRef<{
    taskId: string
    agentCli: string
    agentId?: string // 🔹 用户选择的 agent ID
    branch?: string
    taskType?: 'normal' | 'direct'
  } | null>(null)

  // 用户选择的初始分支（创建任务时指定）
  const [initialBranch, setInitialBranch] = useState<string | undefined>()

  // 当前选中的 Agent（用于输入框显示，锁定状态）
  const [selectedAgent, setSelectedAgent] = useState<string>('sisyphus')  // 🔹 修改：使用 string 类型，默认 sisyphus
  
  // 选择模式
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const [detailDraftMessage, setDetailDraftMessage] = useState('')
  const [composerDescription, setComposerDescription] = useState('')
  const [composerExecuteImmediately, setComposerExecuteImmediately] = useState(true)
  const [composerTaskType, setComposerTaskType] = useState<'normal' | 'direct'>('normal')
  const [composerModelId, setComposerModelId] = useState('')
  const [projectSwarm, setProjectSwarm] = useState<SwarmBinding | null>(null)
  const [isLoadingProjectSwarm, setIsLoadingProjectSwarm] = useState(false)
  const detailDraftSaveTimerRef = useRef<number | null>(null)

  // 移动端标签页状态
  const isMobile = useMobile()
  const [mobileTab, setMobileTab] = useState<TaskStatus>('todo')

  // 已有 workspace 的历史记录通过统一 conversation pipeline 获取

  const projects = useProjectStore((state) => state.projects)
  const currentProject = useProjectStore((state) => state.currentProject)
  const fetchProjects = useProjectStore((state) => state.fetchProjects)
  const fetchProjectById = useProjectStore((state) => state.fetchProjectById)
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject)
  const tasks = useTaskStore((state) => state.tasks)
  const fetchTasks = useTaskStore((state) => state.fetchTasks)
  const createTask = useTaskStore((state) => state.createTask)
  const moveTask = useTaskStore((state) => state.moveTask)
  const updateTask = useTaskStore((state) => state.updateTask)
  const discoveryAgent = activeProjectId
    ? normalizeTaskAgentCli(projectSwarm?.swarm.cli)
    : null
  const discovery = useExecutorDiscovery(
    discoveryAgent,
    {
      workspaceId: undefined,
      repoId: activeProjectId,
    }
  )

  const getFullModelId = useCallback((model: { id: string; provider_id?: string | null }) => {
    if (model.provider_id) {
      return `${model.provider_id}/${model.id}`
    }
    return model.id
  }, [])
  const findValidModel = useCallback((candidate: string | null | undefined) => {
    if (!candidate || discovery.models.length === 0) return null
    return discovery.models.find((model) =>
      model.id === candidate ||
      getFullModelId(model) === candidate ||
      `${model.provider_id}/${model.id}` === candidate
    ) ?? null
  }, [discovery.models, getFullModelId])
  const availableAgents = useMemo(
    () =>
      discovery.agents.map((agent) => ({
        id: agent.id,
        name: agent.label,
        description: agent.description ?? agent.label,
        is_available: agent.is_available,
      })),
    [discovery.agents]
  )
  useEffect(() => {
    if (availableAgents.length === 0) return
    const exists = availableAgents.some((agent) => agent.id === selectedAgent)
    if (!exists) {
      setSelectedAgent(availableAgents[0].id)
    }
  }, [availableAgents, selectedAgent])

  useEffect(() => {
    if (!activeTask) return
    const latestTask = tasks.find((task) => task.id === activeTask.id)
    if (!latestTask) return
    if (activeTask.status === 'todo' && detailDraftMessage !== latestTask.description) return
    if (latestTask !== activeTask) {
      setActiveTask(latestTask)
    }
  }, [tasks, activeTask, detailDraftMessage])

  useEffect(() => {
    if (!activeTask) return
    if (activeTask.agentId) {
      setSelectedAgent(activeTask.agentId)
      return
    }
    if (!activeTask.agentCli) return
    setSelectedAgent(normalizeTaskAgentCli(activeTask.agentCli))
  }, [activeTask])

  useEffect(() => {
    if (!activeProjectId) {
      setProjectSwarm(null)
      return
    }

    setIsLoadingProjectSwarm(true)
    fetch(resolveHttpUrl(`/api/projects/${activeProjectId}/swarm-bindings`))
      .then((res) => res.json())
      .then((data: SwarmBinding[]) => {
        const activeBinding = data.find((item) => item.isActive) ?? data[0] ?? null
        setProjectSwarm(activeBinding)
      })
      .catch(() => {
        setProjectSwarm(null)
      })
      .finally(() => {
        setIsLoadingProjectSwarm(false)
      })
  }, [activeProjectId])

  useEffect(() => {
    if (!activeProjectId || !discoveryAgent || discovery.models.length === 0) return
    const scopedStoredModel = readScopedModelPreference(activeProjectId, discoveryAgent)
    const swarmModel = findValidModel(projectSwarm?.swarm.defaultModelId ?? null)
    const discoveryModel = findValidModel(discovery.defaultModel ?? null)
    const preferredModelId = scopedStoredModel
      ? scopedStoredModel
      : swarmModel
        ? getFullModelId(swarmModel)
        : discoveryModel
          ? getFullModelId(discoveryModel)
          : (discovery.models[0] ? getFullModelId(discovery.models[0]) : '')

    if (preferredModelId && composerModelId !== preferredModelId) {
      setComposerModelId(preferredModelId)
    }
  }, [
    activeProjectId,
    composerModelId,
    discovery.defaultModel,
    discovery.models,
    discoveryAgent,
    findValidModel,
    getFullModelId,
    projectSwarm?.swarm.defaultModelId,
  ])

  // 防止无限循环的标志
  const isCheckingRef = useRef(false)
  const lastCheckTimeRef = useRef(0)
  const processedTaskRef = useRef<Set<string>>(new Set()) // 记录已处理的任务
  const COOLDOWN_MS = 5000 // 5秒冷却时间

  // Agent 执行完成后自动将任务状态从 inprogress 改为 pending
  const handleExecutionComplete = useCallback(async () => {
    if (!activeTask || activeTask.status !== 'inprogress') return
    // 防止重复处理同一个任务
    if (processedTaskRef.current.has(activeTask.id)) return
    processedTaskRef.current.add(activeTask.id)
    
    try {
      await updateTask(activeTask.id, { status: 'pending' })
      // 注意：不再在这里调用 fetchTasks，让 task 更新后自动触发重新渲染
    } catch (error) {
      console.error('Failed to update task status on completion:', error)
      // 失败时移除标记，允许重试
      processedTaskRef.current.delete(activeTask.id)
    }
  }, [activeTask]) // 注意：移除 updateTask 依赖

  const handleDirectPushSuccess = useCallback(async () => {
    if (!activeTask) return
    if (activeTask.status === 'done') return
    await updateTask(activeTask.id, { status: 'done' })
  }, [activeTask, updateTask])

  const handlePRCreated = useCallback(async (_url: string) => {
    if (!activeTask) return
    if (activeTask.status !== 'pending') {
      await updateTask(activeTask.id, { status: 'pending' })
    }
  }, [activeTask, updateTask])



  // 任务执行 Hook V2 - 当有 activeTask 且有 project 信息时启用
  const targetBranchValue = currentProject?.targetBranch || 'main'
  console.log('[KanbanBoard] useTaskExecutionV2 props:', {
    currentProject,
    targetBranch: targetBranchValue,
    initialBranch,
    activeTask: {
      id: activeTask?.id,
      modelId: activeTask?.modelId,
      agentCli: activeTask?.agentCli,
    },
  })

  const taskExecution = useTaskExecutionV2({
    taskId: activeTask?.id || '',
    taskDescription: activeTask?.description || '',
    agentCli: ((activeTask?.agentCli || 'OPENCODE').toLowerCase() as ExecutionAgentCli),
    modelId: activeTask?.modelId, // 传递模型
    repoPath: currentProject?.repoPath || '',
    targetBranch: targetBranchValue,
    initialBranch, // 用户创建任务时选择的分支
    setupScript: (currentProject as { setupScript?: string } | null)?.setupScript,
    copyFiles: (currentProject as { copyFiles?: string[] } | null)?.copyFiles,
    workspaceId: selectedWorkspaceId, // 传入已选中的 workspace ID，用于连接 WebSocket
    taskType: activeTask?.taskType as 'normal' | 'direct' | undefined,  // 传递任务类型
    directBranch: activeTask?.directBranch,  // 传递直接任务的分支
    agentId: selectedAgent || undefined,
    imageIds: activeTask?.imageIds,
    onComplete: handleExecutionComplete,
  })
  // 保存 taskExecution.startExecution 的 ref，用于在 useEffect 中调用
  const taskExecutionRef = useRef(taskExecution)
  taskExecutionRef.current = taskExecution

  // 备用检查：当 handleExecutionComplete 没有被触发时（比如页面刷新后 sessionId 丢失）
  // 检查 executionProcesses 状态，如果都已完成但 task 仍是 inprogress，则更新 task 状态
  useEffect(() => {
    const { executionProcesses, isConnected } = taskExecution
    
    // 条件：task 是 inprogress 且已连接
    if (!activeTask || activeTask.status !== 'inprogress' || !isConnected) return

    // 防止重复处理同一个任务
    if (processedTaskRef.current.has(activeTask.id)) return
    
    // 检查是否有 running 的进程
    const hasRunningProcess = executionProcesses.some(
      (p) => p.run_reason === 'codingagent' && p.status === 'running'
    )
    
    // 如果没有 running 的进程且有进程记录，说明已完成
    if (!hasRunningProcess && executionProcesses.length > 0) {
      console.log('[KanbanBoard] Task is inprogress but no running processes, updating status to pending')
      processedTaskRef.current.add(activeTask.id)
      updateTask(activeTask.id, { status: 'pending' }).catch((error) => {
        console.error('Failed to update task status:', error)
        // 失败时移除标记，允许重试
        processedTaskRef.current.delete(activeTask.id)
      })
      // 注意：不再调用 fetchTasks，让 task 更新后自动触发重新渲染
    }
  }, [taskExecution.executionProcesses, taskExecution.isConnected, activeTask]) // 注意：移除 updateTask 依赖

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (!projectId) return
    console.log('[KanbanBoard] Setting activeProjectId from prop:', projectId)
    setActiveProjectId(projectId)
  }, [projectId])

  useEffect(() => {
    if (!activeProjectId) return
    console.log('[KanbanBoard] Fetching project by id:', activeProjectId)
    fetchProjectById(activeProjectId).then((project) => {
      console.log('[KanbanBoard] Fetched project:', project)
      if (project) {
        console.log('[KanbanBoard] Setting currentProject:', project)
        setCurrentProject(project)
      }
    })
    fetchTasks(activeProjectId)
  }, [activeProjectId, fetchProjectById, fetchTasks, setCurrentProject])

  useEffect(() => {
    if (activeProjectId || projects.length === 0) return
    const firstProjectId = projects[0]?.id
    console.log('[KanbanBoard] No activeProjectId, setting to first project:', firstProjectId)
    setActiveProjectId(firstProjectId)
  }, [activeProjectId, projects])

  const ensureTaskInProgress = useCallback(async (task: Task) => {
    if (task.status === 'inprogress') {
      processedTaskRef.current.delete(task.id)
      return
    }
    await updateTask(task.id, { status: 'inprogress' })
    processedTaskRef.current.delete(task.id)
  }, [updateTask])

  const handleStartExecution = useCallback(async () => {
    if (!activeTask) return
    const previousStatus = activeTask.status
    try {
      await ensureTaskInProgress(activeTask)
      await taskExecution.startExecution()
    } catch (error) {
      if (previousStatus !== 'inprogress') {
        await updateTask(activeTask.id, { status: previousStatus })
      }
      throw error
    }
  }, [activeTask, ensureTaskInProgress, taskExecution, updateTask])
  const handleStartExecutionRef = useRef(handleStartExecution)
  handleStartExecutionRef.current = handleStartExecution

  const handleFollowUpSend = useCallback(async (message: string, messageImageIds?: string[], modelId?: string) => {
    if (!activeTask) return
    const previousStatus = activeTask.status
    try {
      await ensureTaskInProgress(activeTask)
      await taskExecution.sendMessage(message, null, messageImageIds, modelId)
    } catch (error) {
      if (previousStatus !== 'inprogress') {
        await updateTask(activeTask.id, { status: previousStatus })
      }
      throw error
    }
  }, [activeTask, ensureTaskInProgress, taskExecution, updateTask])

  // 检查并修复过期的 inprogress tasks（执行已结束但状态未更新）
  // 策略：如果 workspace 没有 session，或者 API 返回 404/错误，说明没有运行中的进程
  useEffect(() => {
    // 防无限循环：冷却时间内不执行
    const now = Date.now()
    if (now - lastCheckTimeRef.current < COOLDOWN_MS) {
      console.log('[KanbanBoard] Skipping: in cooldown period')
      return
    }

    // 防并发：已经在检查中
    if (isCheckingRef.current) {
      console.log('[KanbanBoard] Skipping: already checking')
      return
    }

    console.log('[KanbanBoard] inprogress check: activeProjectId=', activeProjectId, 'tasks.length=', tasks.length)
    if (!activeProjectId || tasks.length === 0) {
      console.log('[KanbanBoard] Skipping: no activeProjectId or no tasks')
      return
    }

    const inprogressTasks = tasks.filter((t) => t.status === 'inprogress')
    console.log('[KanbanBoard] inprogress tasks:', inprogressTasks.map(t => t.id))
    if (inprogressTasks.length === 0) {
      console.log('[KanbanBoard] Skipping: no inprogress tasks')
      return
    }

    isCheckingRef.current = true
    lastCheckTimeRef.current = now

    let cancelled = false

    const checkAndFixTasks = async () => {
      for (const task of inprogressTasks) {
        if (cancelled) break

        console.log('[KanbanBoard] Checking task:', task.id)
        try {
          // 获取该 task 的 workspaces
          const wsResponse = await fetch(`/api/tasks/${task.id}/workspaces`)
          console.log('[KanbanBoard] workspaces API:', wsResponse.status)
          if (!wsResponse.ok) {
            console.log(`[KanbanBoard] Task ${task.id}: workspaces request failed, keep inprogress`)
            continue
          }
          const workspaces = await wsResponse.json()
          console.log('[KanbanBoard] workspaces:', workspaces.length)
          if (cancelled) continue
          if (workspaces.length === 0) {
            console.log(`[KanbanBoard] Task ${task.id}: no workspace, keep inprogress`)
            continue
          }

          // 获取最新的 workspace 的 sessions
          const latestWs = workspaces[0]
          const sessionsResponse = await fetch(`/api/workspaces/${latestWs.id}`)
          console.log('[KanbanBoard] workspace API:', sessionsResponse.status)
          if (!sessionsResponse.ok) {
            console.log(`[KanbanBoard] Task ${task.id}: workspace not available, keep inprogress`)
            continue
          }
          const wsData = await sessionsResponse.json()
          console.log('[KanbanBoard] workspace data:', wsData)
          
          // 策略1：如果没有 session，说明执行已结束
          const hasSession = wsData.sessions && wsData.sessions.length > 0
          
          if (!hasSession) {
            console.log(`[KanbanBoard] Task ${task.id}: no session, keep inprogress`)
            continue
          }

          const sessionId = wsData.sessions[0].id

          // 策略2：尝试获取 processes，如果有错误（比如 404）也说明执行已结束
          let hasRunningProcess = false
          let hasTerminalProcess = false
          try {
            const processesResponse = await fetch(
              `/api/sessions/${sessionId}/processes?show_soft_deleted=true`
            )
            console.log('[KanbanBoard] processes API:', processesResponse.status)
            
            if (processesResponse.ok) {
              const processesResult: {
                success?: boolean
                data?: Array<{ run_reason: string; status: string }>
              } = await processesResponse.json()
              const processes = Array.isArray(processesResult.data) ? processesResult.data : []
              console.log('[KanbanBoard] processes:', processes.length, processes.map((p) => p.status))
              
              hasRunningProcess = processes.some(
                (p: { run_reason: string; status: string }) =>
                  p.run_reason === 'codingagent' && p.status === 'running'
              )
              hasTerminalProcess = processes.some(
                (p: { status: string }) =>
                  p.status === 'completed' || p.status === 'failed' || p.status === 'killed'
              )
            } else {
              console.log(`[KanbanBoard] Task ${task.id}: processes API unavailable, keep inprogress`)
              continue
            }
          } catch (e) {
            console.log('[KanbanBoard] processes API error:', e)
            continue
          }

          console.log('[KanbanBoard] hasRunningProcess:', hasRunningProcess, 'hasTerminalProcess:', hasTerminalProcess)

          if (!hasRunningProcess && hasTerminalProcess) {
            console.log(`[KanbanBoard] Auto-fixing task ${task.id}: inprogress -> pending`)
            await updateTask(task.id, { status: 'pending' })
          }
        } catch (error) {
          console.error(`[KanbanBoard] Error checking task ${task.id}:`, error)
        }
      }

      isCheckingRef.current = false
    }

    // 延迟执行，避免页面加载时立即请求
    const timer = setTimeout(checkAndFixTasks, 2000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tasks, activeProjectId]) // 注意：移除 updateTask 避免无限循环

  // 处理立即执行：当 activeTask 变化且有待执行标记时，自动启动执行
  useEffect(() => {
    const pending = pendingExecutionRef.current
    if (!pending || !activeTask || !currentProject) return

    // 确认是同一个任务
    if (activeTask.id !== pending.taskId) return

    console.log('[KanbanBoard] pending.branch:', pending.branch, 'type:', typeof pending.branch, 'truthy:', !!pending.branch)

    // 设置用户选择的分支（如果有）
    if (pending.branch) {
      console.log('[KanbanBoard] Setting initialBranch to:', pending.branch)
      setInitialBranch(pending.branch)
    } else {
      console.log('[KanbanBoard] pending.branch is falsy, not setting initialBranch')
    }

    // 清除标记（只执行一次）
    pendingExecutionRef.current = null

    // 延迟执行，确保 taskExecution hook 已经更新
    const timer = setTimeout(() => {
      void handleStartExecutionRef.current().catch((error) => {
        console.error('[KanbanBoard] Auto start execution failed:', error)
      })
    }, 100)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask?.id, currentProject])

  // 当 activeTask 改变时，获取 workspaces
  useEffect(() => {
    if (!activeTask) {
      setWorkspaces([])
      setSelectedWorkspaceId(undefined)
      setSelectedWorkspace(null)
      return
    }

    // 切换任务时先清空选中态，避免沿用上一个任务的 workspace/session。
    setSelectedWorkspaceId(undefined)
    setSelectedWorkspace(null)

    let cancelled = false
    const currentTaskId = activeTask.id

    const fetchWorkspaces = async () => {
      try {
        const response = await fetch(`/api/tasks/${currentTaskId}/workspaces`)
        if (response.ok) {
          const workspaceList = await response.json()
          console.log('[KanbanBoard] Fetched workspaces:', workspaceList.length)

          if (cancelled) return

          // 直接使用 workspaces 数据
          const workspaceInfos: WorkspaceInfo[] = workspaceList.map((ws: {
            id: string
            taskId: string
            branch: string
            agentWorkingDir: string | null
            archived: boolean
            pinned: boolean
            createdAt: string
            updatedAt: string
          }) => ({
            id: ws.id,
            taskId: ws.taskId,
            branch: ws.branch,
            agentWorkingDir: ws.agentWorkingDir,
            archived: ws.archived,
            pinned: ws.pinned,
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt,
            status: ws.archived ? 'killed' : 'completed',
          }))

          setWorkspaces(workspaceInfos)

          // 默认选中第一个 workspace
          if (workspaceInfos.length > 0) {
            console.log('[KanbanBoard] Auto-selecting first workspace:', workspaceInfos[0].id)
            setSelectedWorkspaceId(workspaceInfos[0].id)
          } else {
            console.log('[KanbanBoard] No workspaces found for task:', currentTaskId)
          }
        }
      } catch (error) {
        if (cancelled) return
        console.error('Failed to fetch workspaces:', error)
        setWorkspaces([])
      }
    }

    void fetchWorkspaces()
    return () => {
      cancelled = true
    }
  }, [activeTask?.id])

  // 当选中 workspace 改变时，获取 workspace 详情
  useEffect(() => {
    console.log('[KanbanBoard] selectedWorkspaceId changed:', selectedWorkspaceId)

    if (!selectedWorkspaceId) {
      setSelectedWorkspace(null)
      return
    }

    const fetchWorkspaceDetail = async () => {
      try {
        const response = await fetch(`/api/workspaces/${selectedWorkspaceId}`)
        if (response.ok) {
          const data = await response.json()
          setSelectedWorkspace({
            id: data.id,
            branch: data.branch,
            baseBranch: data.baseBranch,
            agentWorkingDir: data.agentWorkingDir,
          })
        }
      } catch (error) {
        console.error('Failed to fetch workspace detail:', error)
        setSelectedWorkspace(null)
      }
    }

    fetchWorkspaceDetail()
  }, [selectedWorkspaceId])

  // 当 taskExecution.workspace 创建成功时，更新 workspaces 列表和选中状态
  useEffect(() => {
    if (!taskExecution.workspace) return

    const newWorkspace = taskExecution.workspace

    // 将新创建的 workspace 添加到列表中（如果不存在）
    setWorkspaces(prev => {
      const exists = prev.some(ws => ws.id === newWorkspace.id)
      if (exists) return prev

      const workspaceInfo: WorkspaceInfo = {
        id: newWorkspace.id,
        taskId: activeTask?.id || '',
        branch: newWorkspace.branch,
        agentWorkingDir: newWorkspace.path,
        archived: false,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'running',
      }
      return [...prev, workspaceInfo]
    })

    // 选中新创建的 workspace
    setSelectedWorkspaceId(newWorkspace.id)
    setSelectedWorkspace({
      id: newWorkspace.id,
      branch: newWorkspace.branch,
      agentWorkingDir: newWorkspace.path,
    })
  }, [taskExecution.workspace?.id, activeTask?.id])

  // 拖拽传感器配置 - 添加触摸支持
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖拽 8px 才开始
      },
    }),
    useSensor(TouchSensor, {
      // 移动端触摸激活
      activationConstraint: {
        delay: 250, // 长按 250ms
        tolerance: 5, // 允许 5px 移动容差
      },
    }),
    useSensor(KeyboardSensor)
  )

  // 拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find((t) => t.id === active.id)
    if (task) {
      setDraggedTask({
        ...task,
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status: task.status,
        agentCli: task.agentCli,
        hasInProgressAttempt: task.status === 'inprogress',
        lastAttemptFailed: false,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      } as Task)
    }
  }

  // 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setDraggedTask(null)

    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // 查找任务和目标状态
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    // 确定目标状态
    let destinationStatus: TaskStatus
    if (columnOrder.includes(overId as TaskStatus)) {
      // 拖到列上
      destinationStatus = overId as TaskStatus
    } else {
      // 拖到其他任务上，使用该任务的状态
      const overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      destinationStatus = overTask.status as TaskStatus
    }

    // 如果状态相同，不做任何操作
    if (task.status === destinationStatus) return

    // 计算新位置
    const destinationTasks = tasks.filter((t) => t.status === destinationStatus)
    const newPosition = destinationTasks.length

    // 调用 moveTask
    moveTask({
      taskId,
      sourceStatus: task.status as TaskStatus,
      destinationStatus,
      newPosition,
    })
  }

  // 按状态分组任务
  const tasksByStatus = useMemo(() => {
    const normalized = tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status: task.status,
      agentCli: task.agentCli,
      agentId: task.agentId,
      modelId: task.modelId,
      taskType: task.taskType,
      directBranch: task.directBranch,
      imageIds: task.imageIds,
      hasInProgressAttempt: task.status === 'inprogress',
      lastAttemptFailed: false,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }))

    return columnOrder.reduce((acc, status) => {
      acc[status] = normalized.filter((task) => task.status === status)
      return acc
    }, {} as Record<TaskStatus, Task[]>)
  }, [tasks])

  // 处理任务点击
  const handleTaskClick = (task: Task) => {
    setActiveTask(task)
    // attempts 会在 useEffect 中根据 activeTask.id 自动获取
  }

  // 处理任务菜单点击
  const handleTaskMenuClick = (task: Task, _e: React.MouseEvent) => {
    // TODO: 显示任务操作菜单
  }

  const handleCloseDetail = () => {
    setActiveTask(null)
  }

  // ==================== 批量选择模式 ====================

  // 进入选择模式
  const handleEnterSelectionMode = () => {
    setSelectionMode(true)
    setSelectedTaskIds(new Set())
  }

  // 退出选择模式
  const handleExitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedTaskIds(new Set())
  }

  // 处理任务选择
  const handleTaskSelect = (task: Task, selected: boolean) => {
    const newSelected = new Set(selectedTaskIds)
    if (selected) {
      newSelected.add(task.id)
    } else {
      newSelected.delete(task.id)
    }
    setSelectedTaskIds(newSelected)
  }

  // 处理全选某列
  const handleSelectAll = (status: TaskStatus) => {
    const tasksInColumn = tasksByStatus[status] || []
    const newSelected = new Set(selectedTaskIds)
    const allSelected = tasksInColumn.every(t => newSelected.has(t.id))
    
    if (allSelected) {
      tasksInColumn.forEach(t => newSelected.delete(t.id))
    } else {
      tasksInColumn.forEach(t => newSelected.add(t.id))
    }
    
    setSelectedTaskIds(newSelected)
  }

  // 删除单个任务
  const handleTaskDelete = async (task: Task) => {
    const confirmed = window.confirm(
      t('deleteTaskConfirm', { title: task.title || task.description.slice(0, 20) })
    )
    if (!confirmed) return

    try {
      await useTaskStore.getState().deleteTask(task.id)
      // 如果删除的是当前选中的任务，关闭详情面板
      if (activeTask?.id === task.id) {
        setActiveTask(null)
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedTaskIds.size === 0) return
    
    const confirmed = window.confirm(t('deleteSelectedConfirm', { count: selectedTaskIds.size }))
    if (!confirmed) return

    try {
      const deleteTaskFn = useTaskStore.getState().deleteTask
      for (const taskId of selectedTaskIds) {
        await deleteTaskFn(taskId)
      }
      handleExitSelectionMode()
    } catch (error) {
      console.error('Failed to batch delete tasks:', error)
    }
  }

  // 处理任务创建
  const handleTaskCreated = useCallback(async (values: {
    description: string
    agentCli: string
    agentId?: string
    modelId?: string
    executeImmediately: boolean
    taskType: 'normal' | 'direct'
    imageIds?: string[]
  }) => {
    if (!activeProjectId) {
      alert(t('cannotCreateNoProjectRefresh'))
      return
    }
    const status: TaskStatus = 'todo'

    try {
      const normalizedAgentCli = normalizeTaskAgentCli(values.agentCli)
      const newTask = await createTask({
        projectId: activeProjectId,
        description: values.description,
        agentCli: normalizedAgentCli,
        agentId: values.agentId,
        modelId: values.modelId,
        status,
        taskType: values.taskType,
        directBranch: values.taskType === 'direct' ? (currentProject?.targetBranch || undefined) : undefined,
        imageIds: values.imageIds,
      })

      if (values.executeImmediately && newTask) {
        pendingExecutionRef.current = {
          taskId: newTask.id,
          agentCli: normalizedAgentCli,
          agentId: values.agentId,
          branch: currentProject?.targetBranch || undefined,
          taskType: values.taskType,
        }
        setActiveTask(newTask as Task)
      }
    } catch (error) {
      alert(t('createTaskFailed', { message: error instanceof Error ? error.message : t('unknownError') }))
    }
  }, [activeProjectId, createTask, currentProject?.targetBranch, t])

  const getTaskTitleFromDescription = useCallback((description: string): string | null => {
    const firstLine = description
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    return firstLine ? firstLine.slice(0, 80) : null
  }, [])

  const handleComposerSend = useCallback(async (message: string, imageIds?: string[]) => {
    const description = message.trim()
    if (!description) return
    if (!projectSwarm?.swarm.cli) {
      alert(t('projectSwarmMissing'))
      return
    }
    await handleTaskCreated({
      description,
      agentCli: projectSwarm.swarm.cli,
      agentId: selectedAgent || undefined,
      modelId: composerModelId || undefined,
      executeImmediately: composerExecuteImmediately,
      taskType: composerTaskType,
      imageIds: imageIds || [],
    })
    setComposerDescription('')
  }, [
    projectSwarm?.swarm.cli,
    selectedAgent,
    composerModelId,
    composerExecuteImmediately,
    composerTaskType,
    t,
    handleTaskCreated,
  ])

  const persistTaskDraft = useCallback(async (taskId: string, draft: string) => {
    const title = getTaskTitleFromDescription(draft)
    await updateTask(taskId, {
      title,
      description: draft,
    })
  }, [getTaskTitleFromDescription, updateTask])

  const handleTaskDraftChange = useCallback((nextDraft: string) => {
    setDetailDraftMessage(nextDraft)
    if (!activeTask) return
    if (activeTask.status !== 'todo') return
    setActiveTask({
      ...activeTask,
      title: getTaskTitleFromDescription(nextDraft),
      description: nextDraft,
    })
  }, [activeTask, getTaskTitleFromDescription])

  const handleTaskSend = useCallback(async (message: string, imageIds?: string[], modelId?: string) => {
    if (!activeTask) return
    const draft = message.trim()
    if (!draft) return
    if (!projectSwarm?.swarm.cli) {
      alert(t('projectSwarmMissing'))
      return
    }
    await persistTaskDraft(activeTask.id, draft)
    await handleFollowUpSend(draft, imageIds, modelId)
  }, [activeTask, handleFollowUpSend, persistTaskDraft, projectSwarm?.swarm.cli, t])

  const handleTaskAgentChange = useCallback((nextAgent: string) => {
    setSelectedAgent(nextAgent)
    if (!activeTask) return
    setActiveTask({ ...activeTask, agentCli: nextAgent, agentId: nextAgent })
    updateTask(activeTask.id, { agentCli: normalizeTaskAgentCli(nextAgent), agentId: nextAgent }).catch((error) => {
      console.error('Failed to update task agent:', error)
    })
  }, [activeTask, updateTask])

  const handleTaskModelChange = useCallback((modelId: string) => {
    if (!activeTask) return
    if (isMobile) {
      const snapshot = getTransportSnapshot()
      console.info('[mobile-model] persist model to task', {
        taskId: activeTask.id,
        previousModelId: activeTask.modelId,
        nextModelId: modelId,
        workspaceId: selectedWorkspaceId,
        transportMode: snapshot.mode,
        transportConnected: snapshot.connected,
        transportBackend: snapshot.backendInstanceId,
        transportSession: snapshot.sessionScope,
      })
    }
    setActiveTask({ ...activeTask, modelId })
    setComposerModelId(modelId)
    if (activeProjectId && discoveryAgent) {
      writeScopedModelPreference(activeProjectId, discoveryAgent, modelId)
    }
    updateTask(activeTask.id, { modelId }).catch((error) => {
      console.error('Failed to update task model:', error)
    })
  }, [activeProjectId, activeTask, discoveryAgent, isMobile, selectedWorkspaceId, updateTask])

  const handleComposerModelChange = useCallback((modelId: string) => {
    setComposerModelId(modelId)
    if (!activeProjectId || !discoveryAgent) return
    writeScopedModelPreference(activeProjectId, discoveryAgent, modelId)
  }, [activeProjectId, discoveryAgent])

  const selectedWorkspaceFromList = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  )
  const currentWorktreePath = selectedWorkspace?.agentWorkingDir
    || selectedWorkspaceFromList?.agentWorkingDir
    || taskExecution.workspace?.path
    || ''

  useEffect(() => {
    setPreviewFilePath(null)
  }, [activeTask?.id, currentWorktreePath])

  useEffect(() => {
    if (!activeTask) {
      setDetailDraftMessage('')
      return
    }
    // 只有 todo 状态才显示 description，已执行的任务输入框应该清空
    if (activeTask.status === 'todo') {
      setDetailDraftMessage(activeTask.description || '')
    } else {
      setDetailDraftMessage('')
    }
  }, [activeTask?.id, activeTask?.status])

  useEffect(() => {
    if (!activeTask) return
    if (activeTask.status !== 'todo') return
    const storedTask = tasks.find((item) => item.id === activeTask.id)
    if (!storedTask) return
    const nextTitle = getTaskTitleFromDescription(detailDraftMessage)
    const currentTitle = storedTask.title || null
    if (storedTask.description === detailDraftMessage && currentTitle === nextTitle) {
      return
    }
    if (detailDraftSaveTimerRef.current) {
      window.clearTimeout(detailDraftSaveTimerRef.current)
    }
    detailDraftSaveTimerRef.current = window.setTimeout(() => {
      void persistTaskDraft(activeTask.id, detailDraftMessage)
    }, 350)
    return () => {
      if (detailDraftSaveTimerRef.current) {
        window.clearTimeout(detailDraftSaveTimerRef.current)
      }
    }
  }, [activeTask, detailDraftMessage, getTaskTitleFromDescription, persistTaskDraft, tasks])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div
        id="kanban-file-preview-overlay-host"
        className="relative flex-1 min-h-0 overflow-auto"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {isMobile ? (
            // 移动端：标签页模式（可水平滚动）
            <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as TaskStatus)} className="h-full flex flex-col">
              <div className="flex items-stretch border-b border-border bg-card">
                <TabsList className="h-14 flex-1 overflow-x-auto no-scrollbar rounded-none pl-0">
                  {columnOrder.map((status) => {
                    const config = {
                      todo: { label: tColumn('status.todo'), count: tasksByStatus.todo?.length || 0, color: 'bg-blue-500' },
                      inprogress: { label: tColumn('status.inprogress'), count: tasksByStatus.inprogress?.length || 0, color: 'bg-amber-500' },
                      pending: { label: tColumn('status.pending'), count: tasksByStatus.pending?.length || 0, color: 'bg-violet-500' },
                      done: { label: tColumn('status.done'), count: tasksByStatus.done?.length || 0, color: 'bg-emerald-500' },
                      cancelled: { label: tColumn('status.cancelled'), count: tasksByStatus.cancelled?.length || 0, color: 'bg-gray-400' },
                    }[status]
                    const isActive = mobileTab === status
                    return (
                      <TabsTrigger
                        key={status}
                        value={status}
                        className="flex-shrink-0 min-w-[80px] flex-col gap-0.5 rounded-none border-b-3 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
                      >
                        <div className={cn("h-1.5 w-1.5 rounded-full", isActive ? config.color : 'bg-muted-foreground/40')} />
                        <span className={cn("text-xs font-medium", isActive ? 'text-foreground' : 'text-muted-foreground')}>{config.label}</span>
                        <span className={cn("text-[10px] font-medium", isActive ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{config.count}</span>
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
                {!activeTask && (selectionMode ? (
                  <div className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
                      title={tHeader('deleteTasksTitle', { count: selectedTaskIds.size })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleExitSelectionMode}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      title={tHeader('cancelSelection')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center px-2">
                    <button
                      type="button"
                      onClick={handleEnterSelectionMode}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title={tHeader('multiSelect')}
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {tHeader('multi')}
                    </button>
                  </div>
                ))}
              </div>
              {columnOrder.map((status) => (
                <TabsContent key={status} value={status} className="m-0 flex-1 overflow-y-auto bg-background p-0">
                  <div className="p-3 space-y-2">
                    <KanbanColumn
                      status={status}
                      tasks={tasksByStatus[status] || []}
                      onTaskClick={handleTaskClick}
                      onTaskMenuClick={handleTaskMenuClick}
                      onTaskDelete={handleTaskDelete}
                      selectionMode={selectionMode}
                      selectedTaskIds={selectedTaskIds}
                      onTaskSelect={handleTaskSelect}
                      onSelectAll={handleSelectAll}
                      className="border-0 min-w-0 w-full"
                    />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            // 桌面端：水平滚动模式
            <div className="flex h-full min-h-0 flex-col">
              {!activeTask && (
                <div className="flex justify-end px-4 pb-1 pt-2">
                  {selectionMode ? (
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 p-1 backdrop-blur-sm">
                      <span className="px-1 text-[11px] text-muted-foreground">
                        {tHeader('selectedTasks', { count: selectedTaskIds.size })}
                      </span>
                      <button
                        type="button"
                        onClick={handleBatchDelete}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
                        title={tHeader('bulkDelete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {tHeader('bulkDelete')}
                      </button>
                      <button
                        type="button"
                        onClick={handleExitSelectionMode}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        title={tHeader('cancelSelection')}
                      >
                        <X className="h-3.5 w-3.5" />
                        {tHeader('cancelSelection')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEnterSelectionMode}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-muted"
                      title={tHeader('multiSelect')}
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {tHeader('multi')}
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-1 min-h-0 min-w-max px-4 pb-4 gap-0">
                {columnOrder.map((status) => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    tasks={tasksByStatus[status] || []}
                    onTaskClick={handleTaskClick}
                    onTaskMenuClick={handleTaskMenuClick}
                    onTaskDelete={handleTaskDelete}
                    selectionMode={selectionMode}
                    selectedTaskIds={selectedTaskIds}
                    onTaskSelect={handleTaskSelect}
                    onSelectAll={handleSelectAll}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 拖拽覆盖层 */}
          <DragOverlay>
            {draggedTask ? <DragOverlayCard task={draggedTask} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {!activeTask && (
        <div className="shrink-0 border-t border-border bg-card/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-4">
          <div className="mx-auto w-full max-w-6xl rounded-2xl border border-border bg-background p-2.5 shadow-sm md:p-3">
            <WysiwygFollowUpInput
              isExecuting={false}
              isConnected
              agent={selectedAgent}
              selectedModelId={composerModelId || undefined}
              value={composerDescription}
              onValueChange={setComposerDescription}
              onSend={handleComposerSend}
              onStop={taskExecution.stopExecution}
              onAgentChange={setSelectedAgent}
              onModelChange={handleComposerModelChange}
              statusBarVisible={false}
              stopButtonVisible={false}
              toolbarExtras={
                <>
                  <div className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => setComposerTaskType('normal')}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        composerTaskType === 'normal' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t('taskTypeNormal')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerTaskType('direct')}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        composerTaskType === 'direct' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t('taskTypeDirect')}
                    </button>
                  </div>
                  <div className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{t('executeImmediately')}</span>
                    <Switch
                      checked={composerExecuteImmediately}
                      onCheckedChange={setComposerExecuteImmediately}
                    />
                  </div>
                  <div className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted/20 px-2 text-[10px] text-muted-foreground">
                    <Layers3 className="h-3 w-3" />
                    <span className="max-w-[118px] truncate font-medium text-foreground">
                      {isLoadingProjectSwarm ? t('loadingProjectSwarm') : projectSwarm?.swarm.name || t('none')}
                    </span>
                  </div>
                  <div className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted/20 px-2 text-[10px] text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span className="max-w-[110px] truncate font-medium text-foreground">
                      {currentProject?.targetBranch || t('defaultBranch')}
                    </span>
                  </div>
                </>
              }
            />
          </div>
        </div>
      )}

      {activeTask && (
        <TaskDetailLayout
          header={
            <div className={cn(
              "flex shrink-0 items-center justify-between border-b border-border bg-card text-card-foreground",
              isMobile ? "h-20 px-4" : "h-14 px-6"
            )}>
              <div className={cn(
                "flex items-center",
                isMobile ? "gap-3 pb-1" : "gap-3"
              )}>
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className={cn(
                    "flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground active:text-foreground",
                    isMobile ? "p-4 -ml-4 -mb-4 gap-2" : "gap-1"
                  )}
                >
                  <ArrowLeft className={cn(isMobile ? "w-7 h-7" : "w-4 h-4")} />
                  {!isMobile && t('backToBoard')}
                </button>
                {!isMobile && <div className="h-5 w-px bg-border" />}
                <div className="flex flex-col">
                  <span className={cn(
                    "text-sm font-semibold text-foreground",
                    isMobile && "truncate max-w-[150px]"
                  )}>
                    {activeTask.title || activeTask.description}
                  </span>
                  {!isMobile && (
                    <span className="text-[11px] text-muted-foreground">
                      Task ID: {activeTask.id}
                    </span>
                  )}
                </div>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-ring/60 hover:text-foreground">
                    {t('share')}
                  </button>
                  <button className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-ring/60 hover:text-foreground">
                    {t('openIDE')}
                    <SquareArrowOutUpRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="p-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {isMobile && (
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="p-4 -mr-4 -mb-4 text-muted-foreground hover:text-foreground active:text-foreground"
                >
                  <X className="w-7 h-7" />
                </button>
              )}
            </div>
          }
          taskPanel={
            <TaskPanel
              task={activeTask}
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={setSelectedWorkspaceId}
              locale={locale}
              labels={{
                taskInfo: tTaskDetail('taskInfo'),
                worktrees: tTaskDetail('worktrees'),
                noWorktree: tTaskDetail('noWorktree'),
                workspaceNotConfigured: tTaskDetail('workspaceNotConfigured'),
                deleteWorktree: tTaskDetail('deleteWorktree'),
                deleteWorktreeConfirm: tTaskDetail('deleteWorktreeConfirm'),
                createWorktree: tTaskDetail('createWorktree'),
                attemptStatus: {
                  running: tTaskDetail('attemptStatus.running'),
                  completed: tTaskDetail('attemptStatus.completed'),
                  failed: tTaskDetail('attemptStatus.failed'),
                  killed: tTaskDetail('attemptStatus.killed'),
                },
                statusLabels: {
                  todo: tColumn('status.todo'),
                  inprogress: tColumn('status.inprogress'),
                  pending: tColumn('status.pending'),
                  done: tColumn('status.done'),
                  cancelled: tColumn('status.cancelled'),
                },
                createWorktreeModal: {
                  createWorktree: tTaskDetail('createWorktree'),
                  selectBaseBranchDescription: tTaskDetail('selectBaseBranchDescription'),
                  baseBranch: tTaskDetail('baseBranch'),
                  loadingBranches: tTaskDetail('loadingBranches'),
                  selectBranch: tTaskDetail('selectBranch'),
                  branchNotFound: tTaskDetail('branchNotFound'),
                  current: tTaskDetail('current'),
                  repoPathNotConfigured: tTaskDetail('repoPathNotConfigured'),
                  cancel: tTaskDetail('cancel'),
                },
              }}
              onCreateWorkspace={async (baseBranch: string) => {
                if (!activeTask || !currentProject) return

                // 设置基准分支
                setInitialBranch(baseBranch)

                // 重置 taskExecution 状态，确保创建新的 workspace
                taskExecution.restartExecution()

                // 确保有内容可以启动
                const initialMessage = activeTask.description || t('startExecutionTask')

                try {
                  // 使用 task description 作为初始 prompt 启动 agent
                  // 这会创建 workspace + session 并启动 agent
                  await handleFollowUpSend(initialMessage)

                  // 注意：不设置 selectedWorkspaceId，让 attemptPanel 继续显示 taskExecution 内容
                  // 这样 GitPanel 能正确显示 workspace 信息
                } catch (error) {
                  console.error('Failed to start execution:', error)
                }
              }}
              onDeleteWorkspace={async (workspaceId: string) => {
                try {
                  const response = await fetch(`/api/workspaces/${workspaceId}`, {
                    method: 'DELETE',
                  })
                  if (!response.ok) {
                    throw new Error('Failed to delete workspace')
                  }

                  // 刷新 workspaces 列表
                  const wsResponse = await fetch(`/api/tasks/${activeTask?.id}/workspaces`)
                  if (wsResponse.ok) {
                    const workspaceList = await wsResponse.json()
                    const workspaceInfos: WorkspaceInfo[] = workspaceList.map((ws: {
                      id: string
                      taskId: string
                      branch: string
                      agentWorkingDir: string | null
                      agentCli: string
                      archived: boolean
                      pinned: boolean
                      createdAt: string
                      updatedAt: string
                    }) => ({
                      id: ws.id,
                      taskId: ws.taskId,
                      branch: ws.branch,
                      agentWorkingDir: ws.agentWorkingDir,
                      agentCli: ws.agentCli,
                      archived: ws.archived,
                      pinned: ws.pinned,
                      createdAt: ws.createdAt,
                      updatedAt: ws.updatedAt,
                      status: ws.archived ? 'killed' : 'completed',
                    }))
                    setWorkspaces(workspaceInfos)

                    // 如果删除的是当前选中的，选择其他 workspace
                    if (workspaceId === selectedWorkspaceId) {
                      if (workspaceInfos.length > 0) {
                        setSelectedWorkspaceId(workspaceInfos[0].id)
                      } else {
                        setSelectedWorkspaceId(undefined)
                        setSelectedWorkspace(null)
                      }
                    }
                  }
                } catch (error) {
                  console.error('Failed to delete workspace:', error)
                  alert(t('deleteFailed', { message: error instanceof Error ? error.message : t('unknownError') }))
                }
              }}
              repoPath={currentProject?.repoPath}
            />
          }
          attemptPanel={
            activeTask && currentProject ? (
              <div className="relative flex h-full flex-col bg-background text-foreground">
                <div className="relative flex-1 min-h-0">
                  {taskExecution.sessionId || taskExecution.isStarting ? (
                    <div className="h-full space-y-4 overflow-y-auto bg-background p-4">
                      <ConversationHistoryEntries sessionId={taskExecution.sessionId} />
                      {taskExecution.isStarting && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                          <span className="text-xs">{t('creatingExecutionEnv')}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full bg-background" />
                  )}
                  {!isMobile && previewFilePath ? (
                    <div className="absolute inset-y-0 right-0 z-40 flex min-h-0 w-[min(65%,920px)] overflow-hidden border-l border-border bg-card shadow-2xl">
                      <WorktreeFilePreviewPane
                        worktreePath={currentWorktreePath}
                        filePath={previewFilePath}
                        onClose={() => setPreviewFilePath(null)}
                        className="h-full min-h-0 w-full"
                      />
                    </div>
                  ) : null}
                </div>
                {!taskExecution.sessionId && !taskExecution.isStarting ? (
                  <WysiwygFollowUpInput
                    isExecuting={false}
                    isConnected
                    agent={selectedAgent}
                    workspaceId={selectedWorkspaceId}
                    selectedModelId={activeTask?.modelId}
                    value={detailDraftMessage}
                    onValueChange={handleTaskDraftChange}
                    onSend={handleTaskSend}
                    onStop={taskExecution.stopExecution}
                    onAgentChange={handleTaskAgentChange}
                    onModelChange={handleTaskModelChange}
                    statusBarVisible={false}
                    toolbarExtras={(
                      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground">
                        <span>{t('projectBranchLabel')}</span>
                        <span className="max-w-[160px] truncate font-medium text-foreground">
                          {currentProject?.targetBranch || t('defaultBranch')}
                        </span>
                      </div>
                    )}
                  />
                ) : taskExecution.sessionId ? (
                  <WysiwygFollowUpInput
                    isExecuting={taskExecution.isExecuting}
                    isConnected={taskExecution.isConnected}
                    agent={selectedAgent}
                    workspaceId={selectedWorkspaceId}
                    selectedModelId={activeTask?.modelId}
                    value={detailDraftMessage}
                    onValueChange={handleTaskDraftChange}
                    onSend={handleTaskSend}
                    onStop={taskExecution.stopExecution}
                    onAgentChange={handleTaskAgentChange}
                    onModelChange={handleTaskModelChange}
                    statusBarVisible={false}
                  />
                ) : (
                  <div className="border-t border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <span>{t('starting')}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <AttemptPanel
                mode={activeTask?.status === 'pending' ? 'reviewing' : 'executing'}
                sessionId={selectedWorkspaceId || 'no-session'}
                messages={[]}
              />
            )
          }
          diffsPanel={
            <GitPanel
              worktreePath={currentWorktreePath}
              // 目标分支优先级：workspace.baseBranch > currentProject.targetBranch（从后端获取）
              // 不应该有硬编码默认值，如果为空说明数据获取有问题
              targetBranch={selectedWorkspace?.baseBranch || taskExecution.workspace?.baseBranch || currentProject?.targetBranch || ''}
              branchName={selectedWorkspace?.branch || taskExecution.workspace?.branch || ''}
              onDirectPushSuccess={handleDirectPushSuccess}
              onPRCreated={handlePRCreated}
              onOpenFilePreview={setPreviewFilePath}
            />
          }
        />
      )}
    </div>
  )
}
