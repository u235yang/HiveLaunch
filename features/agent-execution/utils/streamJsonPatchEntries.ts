// streamJsonPatchEntries.ts - WebSocket JSON patch streaming utility
// Adapted from vibe-kanban

import type { Operation } from 'rfc6902'
import { applyUpsertPatch } from '@/features/agent-execution/lib/jsonPatch'
import {
  createTransportWebSocket,
  type TransportWebSocketLike,
} from '@/features/agent-execution/lib/api-config'

type PatchContainer<E = unknown> = { entries: E[] }

export interface StreamOptions<E = unknown> {
  initial?: PatchContainer<E>
  /** called after each successful patch application */
  onEntries?: (entries: E[]) => void
  onConnect?: () => void
  onError?: (err: unknown) => void
  /** called once when a "finished" event is received */
  onFinished?: (entries: E[]) => void
}

interface StreamController<E = unknown> {
  /** Current entries array (immutable snapshot) */
  getEntries(): E[]
  /** Full { entries } snapshot */
  getSnapshot(): PatchContainer<E>
  /** Best-effort connection state */
  isConnected(): boolean
  /** Subscribe to updates; returns an unsubscribe function */
  onChange(cb: (entries: E[]) => void): () => void
  /** Close the stream */
  close(): void
}

/**
 * Connect to a WebSocket endpoint that emits JSON messages containing:
 *   {"JsonPatch": [{"op": "add", "path": "/entries/0", "value": {...}}, ...]}
 *   {"Finished": ""}
 *
 * Maintains an in-memory { entries: [] } snapshot and returns a controller.
 */
export function streamJsonPatchEntries<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  let connected = false
  let terminal = false
  let hasOpened = false
  let retryAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let snapshot: PatchContainer<E> = structuredClone(
    opts.initial ?? ({ entries: [] } as PatchContainer<E>)
  )

  const subscribers = new Set<(entries: E[]) => void>()
  if (opts.onEntries) subscribers.add(opts.onEntries)

  // Convert HTTP endpoint to WebSocket endpoint
  const wsUrl = url.replace(/^http/, 'ws')
  let ws: TransportWebSocketLike | null = null
  const isLocalDesktopWsEndpoint = (endpoint: string): boolean => {
    try {
      const parsed = new URL(endpoint)
      return (
        (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') &&
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
        parsed.port === '3847'
      )
    } catch {
      return false
    }
  }
  const resolveHealthUrl = (endpoint: string): string | null => {
    try {
      const parsed = new URL(endpoint.replace(/^ws(s?):\/\//, 'http$1://'))
      parsed.pathname = '/health'
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return null
    }
  }
  const waitForBackendReady = async (endpoint: string): Promise<boolean> => {
    const healthUrl = resolveHealthUrl(endpoint)
    if (!healthUrl) return false
    for (let i = 0; i < 6; i += 1) {
      if (terminal) return false
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

  const notify = () => {
    for (const cb of subscribers) {
      try {
        cb(snapshot.entries)
      } catch {
        /* swallow subscriber errors */
      }
    }
  }

  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data)

      // 调试日志：记录收到的所有消息
      console.log('[streamJsonPatchEntries] Received message:', Object.keys(msg))

      if (msg?.error) {
        terminal = true
        opts.onError?.(new Error(String(msg.error)))
        ws?.close()
        return
      }

      // Handle Ready messages (from DB fallback reconstruction)
      if (msg.Ready !== undefined) {
        console.log('[streamJsonPatchEntries] Ready message received, waiting for JsonPatch entries...')
        // Ready is just a signal, no entries yet
        return
      }

      // Handle JsonPatch messages (from LogMsg::to_ws_message)
      if (msg.JsonPatch) {
        const raw = msg.JsonPatch as Operation[]
        const ops = dedupeOps(raw)

        console.log('[streamJsonPatchEntries] Received JsonPatch with', ops.length, 'operations')

        // Apply to a working copy (applyPatch mutates)
        const next = structuredClone(snapshot)
        applyUpsertPatch(next, ops)

        snapshot = next
        notify()
      }

      // Handle Finished messages
      if (msg.finished !== undefined) {
        console.log('[streamJsonPatchEntries] Finished message received, total entries:', snapshot.entries.length)
        terminal = true
        opts.onFinished?.(snapshot.entries)
        ws?.close()
      }
    } catch (err) {
      console.error('[streamJsonPatchEntries] Error handling message:', err)
      opts.onError?.(err)
    }
  }

  const connect = () => {
    if (terminal) return
    void (async () => {
      if (isLocalDesktopWsEndpoint(wsUrl)) {
        const ready = await waitForBackendReady(wsUrl)
        if (!ready || terminal) {
          if (!terminal && retryAttempts < 5) {
            const delay = Math.min(4000, 500 * Math.pow(2, retryAttempts))
            retryAttempts += 1
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              connect()
            }, delay)
            return
          }
          if (!terminal) {
            opts.onError?.(new Error('WebSocket closed before finished'))
          }
          return
        }
      }
      const socket = createTransportWebSocket(wsUrl)
      ws = socket
      socket.addEventListener('open', () => {
        if (ws !== socket) return
        connected = true
        hasOpened = true
        retryAttempts = 0
        opts.onConnect?.()
      })
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('error', (err) => {
        if (ws !== socket) return
        if (terminal) return
        if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return
        console.warn('[streamJsonPatchEntries] WebSocket transient error event', {
          type: err.type,
          readyState: socket.readyState,
          url: wsUrl,
        })
        connected = false
      })
      socket.addEventListener('close', (rawEvent) => {
        const event = rawEvent as CloseEvent
        if (ws !== socket) return
        ws = null
        connected = false
        console.warn('[streamJsonPatchEntries] WebSocket close event', {
          code: event.code,
          reason: event.reason || null,
          wasClean: event.wasClean,
          readyState: socket.readyState,
          url: wsUrl,
        })
        if (terminal) {
          return
        }
        if (!hasOpened && retryAttempts < 5) {
          const delay = Math.min(4000, 500 * Math.pow(2, retryAttempts))
          retryAttempts += 1
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            connect()
          }, delay)
          return
        }
        const closeReason = event.reason?.trim()
        if (closeReason) {
          opts.onError?.(new Error(`WebSocket closed before finished: ${closeReason}`))
          return
        }
        opts.onError?.(
          new Error(
            `WebSocket closed before finished (code: ${event.code}, clean: ${String(event.wasClean)})`
          )
        )
      })
    })()
  }

  connect()

  return {
    getEntries(): E[] {
      return snapshot.entries
    },
    getSnapshot(): PatchContainer<E> {
      return snapshot
    },
    isConnected(): boolean {
      return connected
    },
    onChange(cb: (entries: E[]) => void): () => void {
      subscribers.add(cb)
      // push current state immediately
      cb(snapshot.entries)
      return () => subscribers.delete(cb)
    },
    close(): void {
      terminal = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      ws?.close()
      subscribers.clear()
      connected = false
    },
  }
}

/**
 * Dedupe multiple ops that touch the same path within a single event.
 * Last write for a path wins, while preserving the overall left-to-right
 * order of the *kept* final operations.
 *
 * Example:
 *   add /entries/4, replace /entries/4  -> keep only the final replace
 */
function dedupeOps(ops: Operation[]): Operation[] {
  const lastIndexByPath = new Map<string, number>()
  ops.forEach((op, i) => lastIndexByPath.set(op.path, i))

  // Keep only the last op for each path, in ascending order of their final index
  const keptIndices = [...lastIndexByPath.values()].sort((a, b) => a - b)
  return keptIndices.map((i) => ops[i]!)
}
