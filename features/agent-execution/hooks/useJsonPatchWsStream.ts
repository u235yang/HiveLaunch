'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { produce } from 'immer'
import type { Operation } from 'rfc6902'
import { applyUpsertPatch } from '@/features/agent-execution/lib/jsonPatch'
import {
  createTransportWebSocket,
  getTransportSnapshot,
  subscribeTransportSnapshot,
  type TransportWebSocketLike,
} from '@/features/agent-execution/lib/api-config'

type WsJsonPatchMsg = { JsonPatch: Operation[] }
type WsReadyMsg = { Ready: true }
type WsFinishedMsg = { finished: boolean }
type WsErrorMsg = { error: string }
type WsMsg = WsJsonPatchMsg | WsReadyMsg | WsFinishedMsg | WsErrorMsg

interface UseJsonPatchStreamOptions<T> {
  /**
   * Called once when the stream starts to inject initial data
   */
  injectInitialEntry?: (data: T) => void
  /**
   * Filter/deduplicate patches before applying them
   */
  deduplicatePatches?: (patches: Operation[]) => Operation[]
}

interface UseJsonPatchStreamResult<T> {
  data: T | undefined
  isConnected: boolean
  isInitialized: boolean
  error: string | null
}

/**
 * Generic hook for consuming WebSocket streams that send JSON messages with patches
 * Adapted from vibe-kanban for bee-kanban
 */
export const useJsonPatchWsStream = <T extends object>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options?: UseJsonPatchStreamOptions<T>
): UseJsonPatchStreamResult<T> => {
  const [data, setData] = useState<T | undefined>(undefined)
  const [isConnected, setIsConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<TransportWebSocketLike | null>(null)
  const dataRef = useRef<T | undefined>(undefined)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryAttemptsRef = useRef<number>(0)
  const [retryNonce, setRetryNonce] = useState(0)
  const [transportNonce, setTransportNonce] = useState(0)
  const finishedRef = useRef<boolean>(false)
  const initializedRef = useRef<boolean>(false)
  const healthProbeRef = useRef<string | null>(null)
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSlashCommandsStream = endpoint?.includes('/api/agents/slash-commands/ws') ?? false
  const isModelDiscoveryStream = endpoint?.includes('/api/agents/discovered-options/ws') ?? false

  const injectInitialEntry = options?.injectInitialEntry
  const deduplicatePatches = options?.deduplicatePatches

  const scheduleReconnect = useCallback(() => {
    if (retryTimerRef.current) return // already scheduled
    // Exponential backoff with cap: 1s, 2s, 4s, 8s (max), then stay at 8s
    const attempt = retryAttemptsRef.current
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt))
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      setRetryNonce((n) => n + 1)
    }, delay)
  }, [])

  const initialDataFn = useCallback(initialData, [initialData])

  useEffect(() => {
    return subscribeTransportSnapshot(() => {
      setTransportNonce((value) => value + 1)
    })
  }, [])

  useEffect(() => {
    if (isModelDiscoveryStream) {
      console.info('[model-discovery][ws] effect start', {
        enabled,
        endpoint,
        retryNonce,
      })
    }
    if (isSlashCommandsStream) {
      console.info('[slash-debug][ws] effect start', {
        enabled,
        endpoint,
        retryNonce,
      })
    }
    if (!enabled || !endpoint) {
      if (isModelDiscoveryStream) {
        console.info('[model-discovery][ws] disabled or missing endpoint, reset state')
      }
      if (isSlashCommandsStream) {
        console.info('[slash-debug][ws] disabled or missing endpoint, reset state')
      }
      // Close connection and reset state
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      retryAttemptsRef.current = 0
      finishedRef.current = false
      setData(undefined)
      setIsConnected(false)
      setIsInitialized(false)
      setError(null)
      initializedRef.current = false
      dataRef.current = undefined
      return
    }

    const transportSnapshot = getTransportSnapshot()
    if (
      transportSnapshot.backendInstanceId &&
      typeof window !== 'undefined' &&
      /^wss?:\/\//.test(endpoint)
    ) {
      try {
        const endpointHost = new URL(endpoint).host
        const backendHost = transportSnapshot.backendInstanceId.split(':').slice(1).join(':')
        if (endpointHost !== backendHost) {
          setError('连接目标已切换，正在重建实时连接')
          scheduleReconnect()
          return
        }
      } catch {
        // ignore invalid endpoint and continue
      }
    }

    // Initialize data
    if (!dataRef.current) {
      dataRef.current = initialDataFn()

      // Inject initial entry if provided
      if (injectInitialEntry) {
        injectInitialEntry(dataRef.current)
      }
    }

    if (
      healthProbeRef.current !== endpoint &&
      endpoint.includes('/api/execution-processes/')
    ) {
      healthProbeRef.current = endpoint
      const healthUrl = endpoint
        .replace(/^ws(s?):\/\//, 'http$1://')
        .replace(/\/api\/execution-processes\/.*$/, '/health')
      fetch(healthUrl).catch(() => {
        // Ignore health probe errors
      })
    }

    // Create WebSocket if it doesn't exist
    if (!wsRef.current) {
      // Reset finished flag for new connection
      finishedRef.current = false
      initializedRef.current = false

      if (isSlashCommandsStream) {
        console.info('[slash-debug][ws] creating websocket', { endpoint })
      }
      if (isModelDiscoveryStream) {
        console.info('[model-discovery][ws] creating websocket', { endpoint })
      }
      const ws = createTransportWebSocket(endpoint)

      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current)
        connectTimerRef.current = null
      }

      ws.onopen = () => {
        if (isSlashCommandsStream) {
          console.info('[slash-debug][ws] open')
        }
        if (isModelDiscoveryStream) {
          console.info('[model-discovery][ws] open')
        }
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current)
          connectTimerRef.current = null
        }
        setError(null)
        setIsConnected(true)
        // Reset backoff on successful connection
        retryAttemptsRef.current = 0
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current)
          retryTimerRef.current = null
        }
      }

      ws.onerror = (err) => {
        console.error('[useJsonPatchWsStream] WebSocket error:', err)
      }

      ws.onmessage = (event) => {
        try {
          const msg: WsMsg = JSON.parse(event.data)

          if (isSlashCommandsStream) {
            const msgType =
              'error' in msg
                ? 'error'
                : 'JsonPatch' in msg
                  ? 'JsonPatch'
                  : 'Ready' in msg
                    ? 'Ready'
                    : 'finished' in msg
                      ? 'finished'
                      : 'unknown'
            console.info('[slash-debug][ws] message', {
              msgType,
              raw: event.data,
            })
          }
          if (isModelDiscoveryStream) {
            const msgType =
              'error' in msg
                ? 'error'
                : 'JsonPatch' in msg
                  ? 'JsonPatch'
                  : 'Ready' in msg
                    ? 'Ready'
                    : 'finished' in msg
                      ? 'finished'
                      : 'unknown'
            console.info('[model-discovery][ws] message', { msgType })
          }

          if ('error' in msg) {
            setError(msg.error)
            // Mark stream as initialized so UI can stop showing perpetual "loading" states.
            setIsInitialized(true)
            initializedRef.current = true
            finishedRef.current = true
            ws.close(1000, msg.error)
            wsRef.current = null
            setIsConnected(false)
            return
          }

          if ('JsonPatch' in msg) {
            const patches: Operation[] = msg.JsonPatch
            const filtered = deduplicatePatches
              ? deduplicatePatches(patches)
              : patches

            const current = dataRef.current
            if (!filtered.length || !current) return

            // Use Immer for structural sharing - only modified parts get new references
            const next = produce(current, (draft) => {
              applyUpsertPatch(draft as object, filtered)
            })

            dataRef.current = next
            setData(next)
          }

          // Handle Ready messages (initial data has been sent)
          if ('Ready' in msg) {
            setIsInitialized(true)
            initializedRef.current = true
          }

          // Handle finished messages ({finished: true})
          // Treat finished as terminal - do NOT reconnect
          if ('finished' in msg) {
            finishedRef.current = true
            ws.close(1000, 'finished')
            wsRef.current = null
            setIsConnected(false)
          }
        } catch (err) {
          console.error('[useJsonPatchWsStream] Failed to process message', {
            error: err,
            data: event.data,
          })
          setError('Failed to process stream update')
        }
      }

      ws.onerror = () => {
        if (isSlashCommandsStream) {
          console.warn('[slash-debug][ws] error event')
        }
        if (isModelDiscoveryStream) {
          console.warn('[model-discovery][ws] error event')
        }
        if (finishedRef.current || initializedRef.current) {
          return
        }
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current)
          connectTimerRef.current = null
        }
        setError('Connection failed')
      }

      ws.onclose = (evt) => {
        if (isSlashCommandsStream) {
          console.info('[slash-debug][ws] close', {
            code: evt?.code,
            reason: evt?.reason,
            wasClean: evt?.wasClean,
            finished: finishedRef.current,
          })
        }
        if (isModelDiscoveryStream) {
          console.info('[model-discovery][ws] close', {
            code: evt?.code,
            reason: evt?.reason,
            wasClean: evt?.wasClean,
            finished: finishedRef.current,
          })
        }
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current)
          connectTimerRef.current = null
        }
        setIsConnected(false)
        wsRef.current = null

        // Do not reconnect if we received a finished message or clean close
        if (finishedRef.current || (evt?.code === 1000 && evt?.wasClean)) {
          return
        }

        // Otherwise, reconnect on unexpected/error closures
        if (!isSlashCommandsStream) {
          retryAttemptsRef.current += 1
          scheduleReconnect()
        }
      }

      wsRef.current = ws
    }

    return () => {
      if (isSlashCommandsStream) {
        console.info('[slash-debug][ws] cleanup')
      }
      if (isModelDiscoveryStream) {
        console.info('[model-discovery][ws] cleanup')
      }
      if (wsRef.current) {
        const ws = wsRef.current

        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current)
          connectTimerRef.current = null
        }
        // Clear all event handlers first to prevent callbacks after cleanup
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null

        // Close regardless of state
        ws.close()
        wsRef.current = null
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      finishedRef.current = false
      initializedRef.current = false
      dataRef.current = undefined
      setData(undefined)
      setIsInitialized(false)
    }
  }, [
    endpoint,
    enabled,
    initialDataFn,
    injectInitialEntry,
    deduplicatePatches,
    retryNonce,
    transportNonce,
    scheduleReconnect,
    isSlashCommandsStream,
    isModelDiscoveryStream,
  ])

  return { data, isConnected, isInitialized, error }
}
