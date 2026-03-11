'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ExecutionProcess,
} from '@/features/agent-execution/types/execution-process'
import { executionProcessesApi } from '@/features/agent-execution/api/sessions'

type ExecutionProcessState = {
  execution_processes: Record<string, ExecutionProcess>
}

interface UseExecutionProcessesResult {
  executionProcesses: ExecutionProcess[]
  executionProcessesById: Record<string, ExecutionProcess>
  isAttemptRunning: boolean
  isLoading: boolean
  isConnected: boolean
  error: string | null
}

/**
 * Poll execution processes for a session via HTTP API.
 * 使用 5 秒轮询间隔，尽快反映真实运行状态
 */
export const useExecutionProcesses = (
  sessionId: string | undefined,
  opts?: { showSoftDeleted?: boolean }
): UseExecutionProcessesResult => {
  const [data, setData] = useState<ExecutionProcessState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  const fetchProcesses = useCallback(async () => {
    if (!sessionId) return

    try {
      const processes = await executionProcessesApi.getBySession(sessionId, {
        showSoftDeleted: opts?.showSoftDeleted,
      })

      if (!isMountedRef.current) return

      const processMap: Record<string, ExecutionProcess> = {}
      for (const p of processes) {
        processMap[p.id] = p
      }

      setData({ execution_processes: processMap })
      setError(null)
      setIsConnected(true)
    } catch (err) {
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch processes')
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [sessionId, opts?.showSoftDeleted])

  // 启动轮询
  useEffect(() => {
    if (!sessionId) {
      setData(null)
      setIsConnected(false)
      return
    }

    isMountedRef.current = true
    setIsLoading(true)
    setError(null)

    // 立即获取一次
    fetchProcesses()

    // 5 秒轮询
    const tick = () => {
      fetchProcesses()
      timerRef.current = setTimeout(tick, 5000)
    }
    timerRef.current = setTimeout(tick, 5000)

    return () => {
      isMountedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [sessionId, fetchProcesses])

  const executionProcessesById = data?.execution_processes ?? {}
  const executionProcesses = (Object.values(executionProcessesById) as ExecutionProcess[]).sort(
    (a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()
  )
  const isAttemptRunning = executionProcesses.some(
    (process) =>
      (process.run_reason === 'codingagent' ||
        process.run_reason === 'setupscript' ||
        process.run_reason === 'cleanupscript' ||
        process.run_reason === 'archivescript') &&
      process.status === 'running'
  )

  return {
    executionProcesses,
    executionProcessesById,
    isAttemptRunning,
    isLoading,
    isConnected,
    error,
  }
}
