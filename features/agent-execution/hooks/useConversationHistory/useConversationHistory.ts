// useConversationHistory.ts - Conversation history loading and management
// Adapted from vibe-kanban

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useExecutionProcessesContext } from '@/features/agent-execution/contexts/ExecutionProcessesContext'
import { useOptionalEntriesContext } from '@/features/agent-execution/contexts/EntriesContext'
import { streamJsonPatchEntries } from '@/features/agent-execution/utils/streamJsonPatchEntries'
import { resolveHttpUrl, resolveRealtimeUrl } from '@/features/agent-execution/lib/api-config'
import type {
  AddEntryType,
  ExecutionProcessStateStore,
  OnEntriesUpdated,
  PatchTypeWithKey,
  UseConversationHistoryParams,
  UseConversationHistoryResult,
} from './types'
import {
  makeLoadingPatch,
  MIN_INITIAL_ENTRIES,
  nextActionPatch,
  REMAINING_BATCH_SIZE,
} from './constants'
import type {
  ExecutionProcess,
  NormalizedEntry,
  PatchType,
  ToolStatus,
  TokenUsageInfo,
} from '@/features/agent-execution/types'

export const useConversationHistory = ({
  sessionId,
  onEntriesUpdated,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const { executionProcessesVisible: executionProcessesRaw } =
    useExecutionProcessesContext()
  const entriesContext = useOptionalEntriesContext()

  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw)
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({})
  const transientProcessStatusRef = useRef<
    Record<string, 'completed' | 'failed' | 'killed'>
  >({})
  const loadedInitialEntries = useRef(false)
  const streamingProcessIdsRef = useRef<Set<string>>(new Set())
  const hydratedHistoricProcessIdsRef = useRef<Set<string>>(new Set())
  const onEntriesUpdatedRef = useRef<OnEntriesUpdated | null>(null)
  const [hasSetupScriptRun, setHasSetupScriptRun] = useState(false)
  const [hasCleanupScriptRun, setHasCleanupScriptRun] = useState(false)
  const [hasRunningProcessState, setHasRunningProcessState] = useState(false)
  const [isFirstTurnState, setIsFirstTurnState] = useState(true)

  const syncProcessStatus = useCallback(
    async (
      processId: string,
      status: 'completed' | 'failed' | 'killed',
      exitCode: number | null
    ) => {
      try {
        await fetch(resolveHttpUrl(`/api/execution-processes/${processId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, exitCode }),
        })
      } catch (error) {
        // 仅 slash 调试时保留其他日志，此处暂时注释
        // console.warn(
        //   `[useConversationHistory] failed to sync process status for ${processId}`,
        //   error
        // )
      }
    },
    []
  )

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current
    mutator(state)
  }

  useEffect(() => {
    onEntriesUpdatedRef.current = onEntriesUpdated
  }, [onEntriesUpdated])

  // Keep executionProcesses up to date
  useEffect(() => {
    executionProcesses.current = executionProcessesRaw.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'archivescript' ||
        ep.run_reason === 'codingagent'
    )

    // DB state has priority once it reaches terminal status.
    for (const process of executionProcessesRaw) {
      if (
        process.status === 'completed' ||
        process.status === 'failed' ||
        process.status === 'killed'
      ) {
        delete transientProcessStatusRef.current[process.id]
      }
    }
  }, [executionProcessesRaw])

  const loadEntriesForHistoricExecutionProcess = (
    executionProcess: ExecutionProcess
  ) => {
    const url = resolveRealtimeUrl(`/api/execution-processes/${executionProcess.id}/normalized-logs/ws`)

    console.log('[useConversationHistory] Loading historic entries:', {
      executionProcessId: executionProcess.id,
      url,
      runReason: executionProcess.run_reason,
      status: executionProcess.status,
    })

    return new Promise<PatchType[]>((resolve) => {
      const controller = streamJsonPatchEntries<PatchType>(url, {
        onConnect: () => {
          console.log('[useConversationHistory] WebSocket connected:', executionProcess.id)
        },
        onEntries: (entries) => {
          console.log('[useConversationHistory] Received entries:', {
            executionProcessId: executionProcess.id,
            count: entries.length,
          })
        },
        onFinished: (allEntries) => {
          console.log('[useConversationHistory] Finished loading:', {
            executionProcessId: executionProcess.id,
            totalEntries: allEntries.length,
          })
          controller.close()
          resolve(allEntries)
        },
        onError: (err) => {
          console.error(
            `[useConversationHistory] 加载历史记录失败 ${executionProcess.id}:`,
            err
          )
          controller.close()
          resolve([])
        },
      })
    })
  }

  const getLiveExecutionProcess = (
    executionProcessId: string
  ): ExecutionProcess | undefined => {
    const process = executionProcesses?.current.find(
      (executionProcess) => executionProcess.id === executionProcessId
    )
    if (!process) return process

    const transientStatus = transientProcessStatusRef.current[executionProcessId]
    if (!transientStatus) return process

    return {
      ...process,
      status: transientStatus,
    }
  }

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number | 'user'
  ) => {
    return {
      ...patch,
      patchKey: `${executionProcessId}:${index}`,
      executionProcessId,
    }
  }

  const getPromptFromExecutorAction = useCallback((
    executionProcess: {
      id: string
      executor_action?: { typ?: unknown } | null
    }
  ): string | null => {
    const actionTypeRaw = executionProcess.executor_action?.typ
    if (!actionTypeRaw || typeof actionTypeRaw !== 'object') return null
    const actionType = actionTypeRaw as { type?: unknown; prompt?: unknown }
    const actionName = typeof actionType.type === 'string' ? actionType.type : null
    if (
      actionName === 'CodingAgentInitialRequest' ||
      actionName === 'CodingAgentFollowUpRequest' ||
      actionName === 'ReviewRequest'
    ) {
      if (typeof actionType.prompt === 'string') {
        return actionType.prompt
      }
    }
    return null
  }, [])

  const flattenEntries = (
    executionProcessState: ExecutionProcessStateStore
  ): PatchTypeWithKey[] => {
    return Object.values(executionProcessState)
      .filter((p) => p.executionProcess.run_reason === 'codingagent')
      .sort(
        (a, b) =>
          new Date(a.executionProcess.created_at).getTime() -
          new Date(b.executionProcess.created_at).getTime()
      )
      .flatMap((p) => p.entries)
  }

  const getActiveAgentProcesses = (): ExecutionProcess[] => {
    return (
      executionProcesses?.current.filter(
        (p) => p.status === 'running' && p.run_reason !== 'devserver'
      ) ?? []
    )
  }

  const flattenEntriesForEmit = useCallback(
    (executionProcessState: ExecutionProcessStateStore) => {
      // Flags to control Next Action bar emit
      let hasPendingApproval = false
      let hasRunningProcess = false
      let lastProcessFailedOrKilled = false
      let needsSetup = false
      let setupHelpText: string | undefined
      let latestTokenUsageInfo: TokenUsageInfo | null = null
      let setupScriptSeen = false
      let cleanupScriptSeen = false

      // Create user messages + tool calls for setup/cleanup scripts
      const allEntries = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(a.executionProcess.created_at).getTime() -
            new Date(b.executionProcess.created_at).getTime()
        )
        .flatMap((p, index) => {
          const entries: PatchTypeWithKey[] = []

          // Handle codingagent process: synthesize user_message from executor_action
          if (p.executionProcess.run_reason === 'codingagent') {
            const prompt = getPromptFromExecutorAction(p.executionProcess)
            if (prompt) {
              const userNormalizedEntry: NormalizedEntry = {
                entry_type: { type: 'user_message' },
                content: prompt,
                timestamp: null,
              }
              const userPatch: PatchType = {
                type: 'NORMALIZED_ENTRY',
                content: userNormalizedEntry,
              }
              entries.push(patchWithKey(userPatch, p.executionProcess.id, 'user'))
            }

            for (let i = p.entries.length - 1; i >= 0; i--) {
              const entry = p.entries[i]
              if (
                entry.type === 'NORMALIZED_ENTRY' &&
                entry.content.entry_type.type === 'token_usage_info'
              ) {
                latestTokenUsageInfo = entry.content.entry_type as TokenUsageInfo
                break
              }
            }

            // 过滤掉 user_message 和 token_usage_info
            const filteredEntries = p.entries.filter(
              (e) =>
                e.type !== 'NORMALIZED_ENTRY' ||
                (e.content.entry_type.type !== 'user_message' &&
                  e.content.entry_type.type !== 'token_usage_info')
            )

            const hasPendingApprovalEntry = filteredEntries.some((entry) => {
              if (entry.type !== 'NORMALIZED_ENTRY') return false
              const entryType = entry.content.entry_type
              return (
                entryType.type === 'tool_use' &&
                entryType.status.status === 'pending_approval'
              )
            })

            if (hasPendingApprovalEntry) {
              hasPendingApproval = true
            }

            entries.push(...filteredEntries)

            const liveProcessStatus = getLiveExecutionProcess(
              p.executionProcess.id
            )?.status
            const isProcessRunning = liveProcessStatus === 'running'
            const processFailedOrKilled =
              liveProcessStatus === 'failed' || liveProcessStatus === 'killed'

            if (isProcessRunning) {
              hasRunningProcess = true
            }

            if (
              processFailedOrKilled &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true

              // Check if this failed process has a SetupRequired entry
              const hasSetupRequired = filteredEntries.some((entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false
                if (
                  entry.content.entry_type.type === 'error_message' &&
                  entry.content.entry_type.error_type?.type === 'setup_required'
                ) {
                  setupHelpText = entry.content.content
                  return true
                }
                return false
              })

              if (hasSetupRequired) {
                needsSetup = true
              }
            }

            if (isProcessRunning && !hasPendingApprovalEntry) {
              entries.push(makeLoadingPatch(p.executionProcess.id))
            }
          } else if (
            p.executionProcess.run_reason === 'setupscript' ||
            p.executionProcess.run_reason === 'cleanupscript' ||
            p.executionProcess.run_reason === 'archivescript'
          ) {
            // Add setup and cleanup script as a tool call
            let toolName = ''
            switch (p.executionProcess.run_reason) {
              case 'setupscript':
                toolName = 'Setup Script'
                setupScriptSeen = true
                break
              case 'cleanupscript':
                toolName = 'Cleanup Script'
                cleanupScriptSeen = true
                break
              case 'archivescript':
                toolName = 'Archive Script'
                break
              default:
                return []
            }

            const executionProcess = getLiveExecutionProcess(
              p.executionProcess.id
            )

            if (executionProcess?.status === 'running') {
              hasRunningProcess = true
            }

            if (
              (executionProcess?.status === 'failed' ||
                executionProcess?.status === 'killed') &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true
            }

            const exitCode = executionProcess?.exit_code || 0
            const toolStatus: ToolStatus =
              executionProcess?.status === 'running'
                ? { status: 'created' }
                : exitCode === 0
                  ? { status: 'success' }
                  : { status: 'failed' }

            const output = p.entries.map((line) => line.content).join('\n')

            const toolNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'tool_use',
                tool_name: toolName,
                action_type: {
                  action: 'command_run',
                  command: '', // TODO: 从数据中获取
                  result: {
                    output,
                    exit_status: {
                      type: 'exit_code',
                      code: exitCode,
                    },
                  },
                },
                status: toolStatus,
              },
              content: toolName,
              timestamp: null,
            }
            const toolPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: toolNormalizedEntry,
            }
            const toolPatchWithKey: PatchTypeWithKey = patchWithKey(
              toolPatch,
              p.executionProcess.id,
              0
            )

            entries.push(toolPatchWithKey)
          }

          return entries
        })

      // Emit the next action bar if no process running
      if (!hasRunningProcess && !hasPendingApproval) {
        allEntries.push(
          nextActionPatch(
            lastProcessFailedOrKilled,
            Object.keys(executionProcessState).length,
            needsSetup,
            setupHelpText
          )
        )
      }

      return {
        entries: allEntries,
        hasRunningProcess,
        latestTokenUsageInfo,
        processCount: Object.keys(executionProcessState).length,
        hasSetupScriptRun: setupScriptSeen,
        hasCleanupScriptRun: cleanupScriptSeen,
      }
    },
    [getPromptFromExecutorAction]
  )

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const {
        entries,
        hasRunningProcess,
        latestTokenUsageInfo,
        processCount,
        hasSetupScriptRun: hasSetupScriptRunNow,
        hasCleanupScriptRun: hasCleanupScriptRunNow,
      } = flattenEntriesForEmit(executionProcessState)
      let modifiedAddEntryType = addEntryType

      // Modify so that if add entry type is 'running' and last entry is a plan, emit special plan type
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1]
        if (
          lastEntry.type === 'NORMALIZED_ENTRY' &&
          lastEntry.content.entry_type.type === 'tool_use' &&
          lastEntry.content.entry_type.tool_name === 'ExitPlanMode'
        ) {
          modifiedAddEntryType = 'plan'
        }
      }

      entriesContext?.setEntries(entries)
      entriesContext?.setTokenUsageInfo(latestTokenUsageInfo)
      setHasRunningProcessState((prev) =>
        prev === hasRunningProcess ? prev : hasRunningProcess
      )
      const isFirstTurn = processCount <= 1
      setIsFirstTurnState((prev) => (prev === isFirstTurn ? prev : isFirstTurn))
      if (hasSetupScriptRunNow) {
        setHasSetupScriptRun(true)
      }
      if (hasCleanupScriptRunNow) {
        setHasCleanupScriptRun(true)
      }
      onEntriesUpdatedRef.current?.(entries, modifiedAddEntryType, loading)
    },
    [entriesContext, flattenEntriesForEmit]
  )

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    (executionProcess: ExecutionProcess): Promise<void> => {
      return new Promise((resolve, reject) => {
        const url = resolveRealtimeUrl(`/api/execution-processes/${executionProcess.id}/normalized-logs/ws`)
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(entries) {
            const patchesWithKey = entries.map((entry, index) =>
              patchWithKey(entry, executionProcess.id, index)
            )
            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
              }
            })
            emitEntries(displayedExecutionProcesses.current, 'running', false)
          },
          onFinished: () => {
            transientProcessStatusRef.current[executionProcess.id] = 'completed'
            void syncProcessStatus(executionProcess.id, 'completed', 0)
            emitEntries(displayedExecutionProcesses.current, 'running', false)
            controller.close()
            resolve()
          },
          onError: () => {
            transientProcessStatusRef.current[executionProcess.id] = 'failed'
            void syncProcessStatus(executionProcess.id, 'failed', -1)
            controller.close()
            reject()
          },
        })
      })
    },
    [emitEntries, syncProcessStatus]
  )

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess) => {
      for (let i = 0; i < 20; i++) {
        const latest = getLiveExecutionProcess(executionProcess.id)
        if (!latest || latest.status !== 'running') {
          break
        }
        try {
          await loadRunningAndEmit(executionProcess)
          break
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    },
    [loadRunningAndEmit]
  )

  const shouldHydrateHistoric = useCallback(
    (executionProcess: ExecutionProcess): boolean => {
      if (executionProcess.status === 'running') return false
      if (hydratedHistoricProcessIdsRef.current.has(executionProcess.id))
        return false

      const existing = displayedExecutionProcesses.current[executionProcess.id]
      if (!existing) return true

      // Only loading means live stream didn't deliver real entries; hydrate from history once.
      if (
        existing.entries.length === 1 &&
        existing.entries[0]?.type === 'NORMALIZED_ENTRY' &&
        existing.entries[0].content.entry_type.type === 'loading'
      ) {
        return true
      }

      // Empty entries also require history hydration.
      return existing.entries.length === 0
    },
    []
  )

  const hydrateHistoricForProcess = useCallback(
    async (executionProcess: ExecutionProcess) => {
      if (!shouldHydrateHistoric(executionProcess)) return

      hydratedHistoricProcessIdsRef.current.add(executionProcess.id)
      try {
        const entries = await loadEntriesForHistoricExecutionProcess(executionProcess)
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        )

        mergeIntoDisplayed((state) => {
          state[executionProcess.id] = {
            executionProcess,
            entries: entriesWithKey,
          }
        })
        emitEntries(displayedExecutionProcesses.current, 'historic', false)
      } catch {
        // Allow one more attempt if hydration failed unexpectedly.
        hydratedHistoricProcessIdsRef.current.delete(executionProcess.id)
      }
    },
    [emitEntries, shouldHydrateHistoric]
  )

  const loadInitialEntries = useCallback(async (): Promise<ExecutionProcessStateStore> => {
    const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {}

    if (!executionProcesses?.current) {
      return localDisplayedExecutionProcesses
    }

    for (const executionProcess of [...executionProcesses.current].reverse()) {
      if (executionProcess.status === 'running') continue

      const entries =
        await loadEntriesForHistoricExecutionProcess(executionProcess)
      const entriesWithKey = entries.map((e, idx) =>
        patchWithKey(e, executionProcess.id, idx)
      )

      localDisplayedExecutionProcesses[executionProcess.id] = {
        executionProcess,
        entries: entriesWithKey,
      }

      if (
        flattenEntries(localDisplayedExecutionProcesses).length >
        MIN_INITIAL_ENTRIES
      ) {
        break
      }
    }

    return localDisplayedExecutionProcesses
  }, [executionProcesses])

  const loadRemainingEntriesInBatches = useCallback(
    async (batchSize: number): Promise<boolean> => {
      if (!executionProcesses?.current) return false

      let anyUpdated = false
      for (const executionProcess of [...executionProcesses.current].reverse()) {
        const current = displayedExecutionProcesses.current
        if (
          current[executionProcess.id] ||
          executionProcess.status === 'running'
        ) {
          continue
        }

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess)
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        )

        mergeIntoDisplayed((state) => {
          state[executionProcess.id] = {
            executionProcess,
            entries: entriesWithKey,
          }
        })

        if (
          flattenEntries(displayedExecutionProcesses.current).length > batchSize
        ) {
          anyUpdated = true
          break
        }
        anyUpdated = true
      }
      return anyUpdated
    },
    [executionProcesses]
  )

  const ensureProcessVisible = useCallback((p: ExecutionProcess) => {
    mergeIntoDisplayed((state) => {
      if (!state[p.id]) {
        state[p.id] = {
          executionProcess: {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            run_reason: p.run_reason,
          },
          entries: [],
        }
      }
    })
  }, [])

  const idListKey = useMemo(
    () => executionProcessesRaw?.map((p) => p.id).join(','),
    [executionProcessesRaw]
  )

  const idStatusKey = useMemo(
    () => executionProcessesRaw?.map((p) => `${p.id}:${p.status}`).join(','),
    [executionProcessesRaw]
  )

  // Initial load when session changes
  useEffect(() => {
    console.log('[useConversationHistory] Session change effect triggered:', {
      sessionId,
      executionProcessesCount: executionProcessesRaw?.length || 0,
      loadedInitialEntries: loadedInitialEntries.current,
    })

    let cancelled = false
    ;(async () => {
      const filteredProcesses = executionProcessesRaw.filter(
        (ep) =>
          ep.run_reason === 'setupscript' ||
          ep.run_reason === 'cleanupscript' ||
          ep.run_reason === 'archivescript' ||
          ep.run_reason === 'codingagent'
      )

      console.log('[useConversationHistory] Filtered processes:', {
        total: executionProcessesRaw?.length || 0,
        filtered: filteredProcesses.length,
      })

      if (
        filteredProcesses.length === 0 ||
        loadedInitialEntries.current
      ) {
        console.log('[useConversationHistory] Skipping initial load:', {
          reason: filteredProcesses.length === 0 ? 'no processes' : 'already loaded',
        })
        return
      }

      // Initial entries
      const allInitialEntries = await loadInitialEntries()
      if (cancelled) return
      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries)
      })
      emitEntries(displayedExecutionProcesses.current, 'initial', false)
      loadedInitialEntries.current = true

      // Then load the remaining in batches
      while (
        !cancelled &&
        (await loadRemainingEntriesInBatches(REMAINING_BATCH_SIZE))
      ) {
        if (cancelled) return
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      emitEntries(displayedExecutionProcesses.current, 'historic', false)
    })()
    return () => {
      cancelled = true
    }
  }, [
    sessionId,
    idListKey,
    loadInitialEntries,
    loadRemainingEntriesInBatches,
    emitEntries,
  ])

  useEffect(() => {
    const activeProcesses = getActiveAgentProcesses()
    if (activeProcesses.length === 0) return

    for (const activeProcess of activeProcesses) {
      if (!displayedExecutionProcesses.current[activeProcess.id]) {
        const runningOrInitial =
          Object.keys(displayedExecutionProcesses.current).length > 1
            ? 'running'
            : 'initial'
        ensureProcessVisible(activeProcess)
        emitEntries(
          displayedExecutionProcesses.current,
          runningOrInitial,
          false
        )
      }

      if (
        activeProcess.status === 'running' &&
        !streamingProcessIdsRef.current.has(activeProcess.id)
      ) {
        streamingProcessIdsRef.current.add(activeProcess.id)
        loadRunningAndEmitWithBackoff(activeProcess).finally(() => {
          streamingProcessIdsRef.current.delete(activeProcess.id)
        })
      }
    }
  }, [
    sessionId,
    idStatusKey,
    emitEntries,
    ensureProcessVisible,
    loadRunningAndEmitWithBackoff,
  ])

  // Backfill completed/failed processes that were skipped during initial running state.
  useEffect(() => {
    if (!executionProcesses.current?.length) return

    for (const process of executionProcesses.current) {
      void hydrateHistoricForProcess(process)
    }
  }, [idStatusKey, hydrateHistoricForProcess])

  // If an execution process is removed, remove it from the state
  useEffect(() => {
    if (!executionProcessesRaw) return

    const removedProcessIds = Object.keys(
      displayedExecutionProcesses.current
    ).filter((id) => !executionProcessesRaw.some((p) => p.id === id))

    if (removedProcessIds.length > 0) {
      mergeIntoDisplayed((state) => {
        removedProcessIds.forEach((id) => {
          delete state[id]
        })
      })
    }
  }, [sessionId, idListKey, executionProcessesRaw])

  // Reset state when session changes.
  // Keep dependency minimal to avoid reset -> emit -> state update loops.
  useEffect(() => {
    displayedExecutionProcesses.current = {}
    loadedInitialEntries.current = false
    streamingProcessIdsRef.current.clear()
    hydratedHistoricProcessIdsRef.current.clear()
    transientProcessStatusRef.current = {}
    setHasSetupScriptRun(false)
    setHasCleanupScriptRun(false)
    setHasRunningProcessState(false)
    setIsFirstTurnState(true)
    entriesContext?.reset()
    onEntriesUpdatedRef.current?.([], 'initial', true)
  }, [sessionId])

  return {
    hasSetupScriptRun,
    hasCleanupScriptRun,
    hasRunningProcess: hasRunningProcessState,
    isFirstTurn: isFirstTurnState,
  }
}
