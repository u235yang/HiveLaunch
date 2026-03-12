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
  const transportSnapshotInitializedRef = useRef<boolean>(false)
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
      if (!transportSnapshotInitializedRef.current) {
        transportSnapshotInitializedRef.current = true
        return
      }
      setTransportNonce((value) => value + 1)
    })
  }, [])

  useEffect(() => {
    let disposed = false
    const isLocalDesktopWsEndpoint = (url: string): boolean => {
      try {
        const parsed = new URL(url)
        return (
          (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') &&
          (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
          parsed.port === '3847'
        )
      } catch {
        return false
      }
    }
    const resolveHealthUrl = (url: string): string | null => {
      try {
        const parsed = new URL(url.replace(/^ws(s?):\/\//, 'http$1://'))
        parsed.pathname = '/health'
        parsed.search = ''
        parsed.hash = ''
        return parsed.toString()
      } catch {
        return null
      }
    }
    const waitForBackendReady = async (url: string): Promise<boolean> => {
      const healthUrl = resolveHealthUrl(url)
      if (!healthUrl) return false
      for (let i = 0; i < 6; i += 1) {
        if (disposed) return false
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 800)
        try {
          const resp = await fetch(healthUrl, { cache: 'no-store', signal: controller.signal })
          if (resp.ok) {
            clearTimeout(timeout)
            return true
          }
        } catch {}
        clearTimeout(timeout)
        await new Promise((resolve) => setTimeout(resolve, Math.min(1200, 200 * Math.pow(2, i))))
      }
      return false
    }
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
    const closeSocket = (ws: TransportWebSocketLike) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
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
        closeSocket(wsRef.current)
        wsRef.current = null
      }
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current)
        connectTimerRef.current = null
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

    // Create WebSocket if it doesn't exist
    if (!wsRef.current) {
      finishedRef.current = false
      initializedRef.current = false

      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current)
        connectTimerRef.current = null
      }

      connectTimerRef.current = setTimeout(() => {
        connectTimerRef.current = null
        void (async () => {
          if (disposed || wsRef.current) {
            return
          }
          if (isLocalDesktopWsEndpoint(endpoint)) {
            const ready = await waitForBackendReady(endpoint)
            if (!ready || disposed || wsRef.current) {
              if (!isSlashCommandsStream) {
                retryAttemptsRef.current += 1
                scheduleReconnect()
              } else {
                setError('Connection failed')
              }
              return
            }
          }
          if (isSlashCommandsStream) {
            console.info('[slash-debug][ws] creating websocket', { endpoint })
          }
          if (isModelDiscoveryStream) {
            console.info('[model-discovery][ws] creating websocket', { endpoint })
          }
          const ws = createTransportWebSocket(endpoint)

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
            retryAttemptsRef.current = 0
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current)
              retryTimerRef.current = null
            }
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
              setIsInitialized(true)
              initializedRef.current = true
              finishedRef.current = true
              if (ws.readyState === WebSocket.OPEN) {
                ws.close(1000, msg.error)
              }
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

              const next = produce(current, (draft) => {
                applyUpsertPatch(draft as object, filtered)
              })

              dataRef.current = next
              setData(next)
            }

            if ('Ready' in msg) {
              setIsInitialized(true)
              initializedRef.current = true
            }

            if ('finished' in msg) {
              finishedRef.current = true
              if (ws.readyState === WebSocket.OPEN) {
                ws.close(1000, 'finished')
              }
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
            if (finishedRef.current || initializedRef.current) {
              return
            }
            if (isSlashCommandsStream) {
              console.warn('[slash-debug][ws] error event')
            }
            if (isModelDiscoveryStream) {
              console.warn('[model-discovery][ws] error event')
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

          if (finishedRef.current || (evt?.code === 1000 && evt?.wasClean)) {
            return
          }

          if (!isSlashCommandsStream) {
            retryAttemptsRef.current += 1
            scheduleReconnect()
          }
          }

          wsRef.current = ws
        })()
      }, 0)
    }

    return () => {
      disposed = true
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

        closeSocket(ws)
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
