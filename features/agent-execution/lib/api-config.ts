// 共享的 API 配置
// 根据环境自动选择正确的后端地址
//
// 架构:
// - 桌面端 (Tauri): 使用本地 Rust 后端 (localhost:3847)
// - Web 开发模式: 相对路径 (通过 Next.js rewrites 代理到 localhost:3847)
// - Web 生产模式: 云端 API (通过环境变量配置)
// - 移动端开发模式: 局域网地址 (默认使用当前页面主机:3847)
// - 移动端生产模式: 云端 API
//
// 环境变量:
// - NEXT_PUBLIC_API_BASE: 手动指定 API 地址
// - NEXT_PUBLIC_LAN_API_BASE: 移动端开发模式的局域网地址 (默认: 当前页面主机:3847)
// - NEXT_PUBLIC_LAN_WS_BASE: 移动端开发模式的局域网 WebSocket 地址 (默认: 当前页面主机:3847)
// - NEXT_PUBLIC_CLOUD_API_BASE: 生产环境的云端 API 地址
// - NEXT_PUBLIC_CLOUD_WS_BASE: 生产环境的云端 WebSocket 地址

// ============ 环境检测 ============

const isBrowser = typeof window !== 'undefined'
const browserHttpProtocol = isBrowser && window.location.protocol === 'https:' ? 'https' : 'http'
const browserWsProtocol = isBrowser && window.location.protocol === 'https:' ? 'wss' : 'ws'

// 环境变量
// 支持两种命名：NEXT_PUBLIC_API_BASE 和 NEXT_PUBLIC_API_BASE_URL
const envApiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_BASE_URL
const envWsBase = process.env.NEXT_PUBLIC_WS_BASE || process.env.NEXT_PUBLIC_WS_BASE_URL
// Tauri 后端端口 (桌面端)
const TAURI_PORT = '3847'

function hasTauriRuntimeMarkers(): boolean {
  if (!isBrowser) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const hasMarkers = typeof w.__TAURI__ !== 'undefined' || typeof w.__TAURI_INTERNALS__ !== 'undefined'
  if (!hasMarkers) return false
  const internalInvoke = w.__TAURI_INTERNALS__?.invoke
  const coreInvoke = w.__TAURI__?.core?.invoke
  return typeof internalInvoke === 'function' || typeof coreInvoke === 'function'
}

function getDefaultLanApiBase(): string {
  if (isBrowser) {
    return `${browserHttpProtocol}://${window.location.hostname}:${TAURI_PORT}`
  }
  return `${browserHttpProtocol}://127.0.0.1:${TAURI_PORT}`
}

function getDefaultLanWsBase(): string {
  if (isBrowser) {
    return `${browserWsProtocol}://${window.location.hostname}:${TAURI_PORT}`
  }
  return `${browserWsProtocol}://127.0.0.1:${TAURI_PORT}`
}

// 局域网后端配置 (移动端开发模式使用)
const LAN_API_BASE = process.env.NEXT_PUBLIC_LAN_API_BASE || getDefaultLanApiBase()
const LAN_WS_BASE = process.env.NEXT_PUBLIC_LAN_WS_BASE || getDefaultLanWsBase()
const MOBILE_CONNECTION_MODE_KEY = 'bee.mobile.connection.mode'
const MOBILE_DIRECT_API_BASE_KEY = 'bee.mobile.connection.directApiBase'
const MOBILE_RELAY_URL_KEY = 'bee.mobile.relay.url'
const MOBILE_RELAY_DEVICE_ID_KEY = 'bee.mobile.relay.deviceId'
const MOBILE_RELAY_PAIRING_KEY_KEY = 'bee.mobile.relay.pairingKey'
const MOBILE_RELAY_DEVICE_NAME_KEY = 'bee.mobile.relay.deviceName'

// 云端后端配置 (生产环境 Web/移动端使用)
const CLOUD_API_BASE = process.env.NEXT_PUBLIC_CLOUD_API_BASE || ''
const CLOUD_WS_BASE = process.env.NEXT_PUBLIC_CLOUD_WS_BASE || ''

export type MobileConnectionMode = 'direct' | 'relay'
export type TransportMode = 'direct' | 'relay'

export type TransportSnapshot = {
  mode: TransportMode
  apiBase: string
  realtimeBase: string
  backendInstanceId: string | null
  sessionScope: string | null
  connected: boolean
}

type RelayConnectResult = {
  type: 'ConnectResult'
  status: string
  session_id?: string
  session_token?: string
  reason?: string
}

type RelayHttpResponse = {
  type: 'HttpResponse'
  request_id: string
  status: number
  headers?: Record<string, string>
  body?: string
}

type RelayWsOpenAck = {
  type: 'WsOpenAck'
  request_id: string
  connection_id: string
  status: string
  reason?: string
}

type RelayWsData = {
  type: 'WsData'
  connection_id: string
  data: string
  is_binary: boolean
}

type RelayWsClose = {
  type: 'WsClose'
  connection_id: string
  code?: number
  reason?: string
}

type RelayError = {
  type: 'Error'
  code?: string
  message?: string
}

type RelayPendingRequest = {
  resolve: (message: RelayHttpResponse) => void
  reject: (reason?: string) => void
  timeoutId: ReturnType<typeof setTimeout>
}

type RelayRuntime = {
  initialized: boolean
  ws: WebSocket | null
  connecting: boolean
  connected: boolean
  sessionId: string | null
  sessionToken: string | null
  pending: Map<string, RelayPendingRequest>
  heartbeatTimer: ReturnType<typeof setInterval> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  connectResolvers: Array<{
    resolve: () => void
    reject: (error: Error) => void
  }>
  originalFetch: typeof window.fetch | null
  lastError: string | null
  reconnectSuppressed: boolean
  listeners: Set<(state: MobileRelayTransportState) => void>
  virtualSockets: Map<string, RelayVirtualSocket>
}

export type MobileRelayTransportState = {
  connected: boolean
  connecting: boolean
  sessionId: string | null
  hasSessionToken: boolean
  lastError: string | null
}

const relayRuntime: RelayRuntime = {
  initialized: false,
  ws: null,
  connecting: false,
  connected: false,
  sessionId: null,
  sessionToken: null,
  pending: new Map(),
  heartbeatTimer: null,
  reconnectTimer: null,
  connectResolvers: [],
  originalFetch: null,
  lastError: null,
  reconnectSuppressed: false,
  listeners: new Set(),
  virtualSockets: new Map(),
}

const transportListeners = new Set<(snapshot: TransportSnapshot) => void>()
let lastTransportFingerprint = ''

function getRelayTransportState(): MobileRelayTransportState {
  return {
    connected: relayRuntime.connected,
    connecting: relayRuntime.connecting,
    sessionId: relayRuntime.sessionId,
    hasSessionToken: Boolean(relayRuntime.sessionToken),
    lastError: relayRuntime.lastError,
  }
}

function notifyRelayState(): void {
  const snapshot = getRelayTransportState()
  relayRuntime.listeners.forEach((listener) => listener(snapshot))
}

function fingerprintTransportSnapshot(snapshot: TransportSnapshot): string {
  return [
    snapshot.mode,
    snapshot.apiBase,
    snapshot.realtimeBase,
    snapshot.backendInstanceId || '',
    snapshot.sessionScope || '',
    snapshot.connected ? '1' : '0',
  ].join('|')
}

function notifyTransportSnapshotChanged(): void {
  const snapshot = getTransportSnapshot()
  const fingerprint = fingerprintTransportSnapshot(snapshot)
  if (fingerprint === lastTransportFingerprint) return
  lastTransportFingerprint = fingerprint
  transportListeners.forEach((listener) => listener(snapshot))
}

function sanitizeApiBase(value: string): string {
  return value.trim().replace(/\/$/, '')
}

function sanitizeHttpBase(value: string): string {
  const sanitized = sanitizeApiBase(value)
  if (!sanitized) return ''
  if (/^https?:\/\//.test(sanitized)) return sanitized
  if (/^wss?:\/\//.test(sanitized)) return toHttpBaseFromWs(sanitized)
  return ''
}

function sanitizeWsBase(value: string): string {
  const sanitized = sanitizeApiBase(value)
  if (!sanitized) return ''
  if (/^wss?:\/\//.test(sanitized)) return sanitized
  if (/^https?:\/\//.test(sanitized)) return toWsBaseFromHttp(sanitized)
  return ''
}

function toWsBaseFromHttp(httpBase: string): string {
  if (!httpBase) return ''
  try {
    const url = new URL(httpBase)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function toHttpBaseFromWs(wsBase: string): string {
  if (!wsBase) return ''
  try {
    const url = new URL(wsBase)
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function getStoredMobileConnectionMode(): MobileConnectionMode | null {
  if (!isBrowser) return null
  const value = window.localStorage.getItem(MOBILE_CONNECTION_MODE_KEY)
  if (value === 'direct' || value === 'relay') {
    return value
  }
  return null
}

function getStoredMobileDirectApiBase(): string | null {
  if (!isBrowser) return null
  const value = window.localStorage.getItem(MOBILE_DIRECT_API_BASE_KEY)
  if (!value) return null
  return sanitizeHttpBase(value) || null
}

function getStoredMobileRelaySettings():
  | { relayUrl: string; deviceId: string; pairingKey: string; deviceName: string }
  | null {
  if (!isBrowser) return null
  const relayUrl = sanitizeWsBase(window.localStorage.getItem(MOBILE_RELAY_URL_KEY)?.trim() || '')
  const deviceId = window.localStorage.getItem(MOBILE_RELAY_DEVICE_ID_KEY)?.trim() || ''
  const pairingKey = window.localStorage.getItem(MOBILE_RELAY_PAIRING_KEY_KEY)?.trim() || ''
  const deviceName = window.localStorage.getItem(MOBILE_RELAY_DEVICE_NAME_KEY)?.trim() || 'Bee Mobile'
  if (!relayUrl || !deviceId || !pairingKey) return null
  return { relayUrl, deviceId, pairingKey, deviceName }
}

function isMobileRuntime(): boolean {
  return isBrowser && (isMobileDevice() || isTauriMobile())
}

function shouldUseRelayTunnel(): boolean {
  return isMobileRuntime() && getStoredMobileConnectionMode() === 'relay'
}

function getBackendInstanceId(mode: TransportMode, apiBase: string, realtimeBase: string): string | null {
  const candidates = [realtimeBase, apiBase]
  for (const value of candidates) {
    if (!value) continue
    try {
      const url = new URL(value, isBrowser ? window.location.origin : 'http://127.0.0.1')
      return `${mode}:${url.host}`
    } catch {
      continue
    }
  }
  return null
}

function clearRelayHeartbeat(): void {
  if (relayRuntime.heartbeatTimer) {
    clearInterval(relayRuntime.heartbeatTimer)
    relayRuntime.heartbeatTimer = null
  }
}

function clearRelayReconnect(): void {
  if (relayRuntime.reconnectTimer) {
    clearTimeout(relayRuntime.reconnectTimer)
    relayRuntime.reconnectTimer = null
  }
}

function rejectPendingRequests(reason: string): void {
  relayRuntime.pending.forEach((pending) => {
    clearTimeout(pending.timeoutId)
    pending.reject(reason)
  })
  relayRuntime.pending.clear()
}

function flushConnectResolvers(error?: Error): void {
  const resolvers = [...relayRuntime.connectResolvers]
  relayRuntime.connectResolvers = []
  for (const item of resolvers) {
    if (error) {
      item.reject(error)
    } else {
      item.resolve()
    }
  }
}

function isRelayCredentialFatalCode(code?: string): boolean {
  if (!code) return false
  return code === 'DEVICE_NOT_FOUND' || code === 'INVALID_PAIRING_KEY' || code === 'PAIRING_KEY_EXPIRED'
}

function isRelayBackoffCode(code?: string): boolean {
  return code === 'RATE_LIMITED' || code === 'PAIRING_COOLDOWN'
}

function markRelayReconnectSuppressed(code?: string): void {
  if (isRelayCredentialFatalCode(code) || isRelayBackoffCode(code)) {
    relayRuntime.reconnectSuppressed = true
  }
}

function releaseRelayReconnectSuppressed(): void {
  relayRuntime.reconnectSuppressed = false
}

function scheduleRelayReconnect(): void {
  if (!isBrowser || !shouldUseRelayTunnel()) return
  if (relayRuntime.connected || relayRuntime.connecting) return
  if (relayRuntime.reconnectSuppressed) return
  clearRelayReconnect()
  relayRuntime.reconnectTimer = setTimeout(() => {
    relayRuntime.reconnectTimer = null
    void ensureRelayConnected()
  }, 1500)
}

function closeRelaySocket(): void {
  clearRelayHeartbeat()
  const ws = relayRuntime.ws
  relayRuntime.ws = null
  relayRuntime.connected = false
  relayRuntime.connecting = false
  relayRuntime.sessionId = null
  relayRuntime.sessionToken = null
  relayRuntime.lastError = null
  releaseRelayReconnectSuppressed()
  rejectPendingRequests('连接已关闭')
  relayRuntime.virtualSockets.forEach((socket) => socket.fail('连接已关闭'))
  relayRuntime.virtualSockets.clear()
  notifyRelayState()
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close()
  } else if (ws && ws.readyState === WebSocket.CONNECTING) {
    ws.close()
  }
}

function normalizeRelayTarget(input: RequestInfo | URL): { pathname: string; query: string | null } | null {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (!raw) return null
  if (raw.startsWith('/api/')) {
    const [pathname, query = ''] = raw.split('?', 2)
    return { pathname, query: query || null }
  }
  let parsed: URL
  try {
    parsed = new URL(raw, isBrowser ? window.location.origin : 'http://localhost')
  } catch {
    return null
  }
  if (!parsed.pathname.startsWith('/api/')) return null
  return { pathname: parsed.pathname, query: parsed.search ? parsed.search.slice(1) : null }
}

function headersToObject(headersInit?: HeadersInit): Record<string, string> {
  const output: Record<string, string> = {}
  if (!headersInit) return output
  const headers = new Headers(headersInit)
  headers.forEach((value, key) => {
    output[key] = value
  })
  return output
}

async function extractRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (typeof input !== 'string' && !(input instanceof URL) && input instanceof Request) {
    const bodyText = await input.clone().text()
    return bodyText || null
  }
  if (!init || init.body == null) return null
  if (typeof init.body === 'string') return init.body
  if (init.body instanceof URLSearchParams) return init.body.toString()
  return null
}

function isRelayFetchCandidate(input: RequestInfo | URL): boolean {
  if (!shouldUseRelayTunnel()) return false
  if (!isBrowser) return false
  return normalizeRelayTarget(input) !== null
}

type TransportEventName = 'open' | 'message' | 'error' | 'close'
type TransportEventListener = (event: Event | MessageEvent | CloseEvent) => void

export interface TransportWebSocketLike {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  addEventListener(type: TransportEventName, listener: TransportEventListener): void
  removeEventListener(type: TransportEventName, listener: TransportEventListener): void
  send(data: string | ArrayBufferLike | ArrayBufferView): void
  close(code?: number, reason?: string): void
}

class RelayVirtualSocket implements TransportWebSocketLike {
  public readyState: number = WebSocket.CONNECTING
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null
  public onclose: ((event: CloseEvent) => void) | null = null
  private readonly listeners = new Map<TransportEventName, Set<TransportEventListener>>()

  constructor(
    private readonly endpoint: string,
    private readonly connectionId: string,
    private readonly requestId: string
  ) {
    this.listeners.set('open', new Set())
    this.listeners.set('message', new Set())
    this.listeners.set('error', new Set())
    this.listeners.set('close', new Set())
  }

  addEventListener(type: TransportEventName, listener: TransportEventListener): void {
    this.listeners.get(type)?.add(listener)
  }

  removeEventListener(type: TransportEventName, listener: TransportEventListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: string | ArrayBufferLike | ArrayBufferView): void {
    if (!relayRuntime.ws || relayRuntime.ws.readyState !== WebSocket.OPEN || !relayRuntime.sessionToken) return
    if (this.readyState !== WebSocket.OPEN) return
    let payload = ''
    let isBinary = false
    if (typeof data === 'string') {
      payload = data
    } else {
      isBinary = true
      const bytes =
        ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
          : new Uint8Array(data)
      payload = encodeBase64(bytes)
    }
    relayRuntime.ws.send(
      JSON.stringify({
        type: 'WsData',
        session_token: relayRuntime.sessionToken,
        connection_id: this.connectionId,
        data: payload,
        is_binary: isBinary,
      })
    )
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === WebSocket.CLOSED || this.readyState === WebSocket.CLOSING) return
    this.readyState = WebSocket.CLOSING
    if (relayRuntime.ws && relayRuntime.ws.readyState === WebSocket.OPEN && relayRuntime.sessionToken) {
      relayRuntime.ws.send(
        JSON.stringify({
          type: 'WsClose',
          session_token: relayRuntime.sessionToken,
          connection_id: this.connectionId,
          code: code ?? 1000,
          reason: reason ?? '',
        })
      )
    }
    this.handleClose(code ?? 1000, reason ?? '')
  }

  handleOpenAck(status: string, reason?: string): void {
    if (this.readyState !== WebSocket.CONNECTING) return
    if (status === 'success') {
      this.readyState = WebSocket.OPEN
      const event = new Event('open')
      this.onopen?.(event)
      this.listeners.get('open')?.forEach((listener) => listener(event))
      return
    }
    this.readyState = WebSocket.CLOSED
    const errorEvent = new Event('error')
    this.onerror?.(errorEvent)
    this.listeners.get('error')?.forEach((listener) => listener(errorEvent))
    const closeEvent = new CloseEvent('close', { code: 1011, reason: reason || 'relay ws open failed' })
    this.onclose?.(closeEvent)
    this.listeners.get('close')?.forEach((listener) => listener(closeEvent))
  }

  handleMessage(data: string, isBinary: boolean): void {
    if (this.readyState !== WebSocket.OPEN) return
    const payload = isBinary ? decodeBase64(data) : data
    const event = new MessageEvent('message', { data: payload })
    this.onmessage?.(event)
    this.listeners.get('message')?.forEach((listener) => listener(event))
  }

  handleClose(code?: number, reason?: string): void {
    if (this.readyState === WebSocket.CLOSED) return
    this.readyState = WebSocket.CLOSED
    relayRuntime.virtualSockets.delete(this.connectionId)
    const event = new CloseEvent('close', {
      code: code ?? 1000,
      reason: reason ?? '',
      wasClean: true,
    })
    this.onclose?.(event)
    this.listeners.get('close')?.forEach((listener) => listener(event))
  }

  fail(errorMessage: string): void {
    if (this.readyState === WebSocket.CLOSED) return
    this.readyState = WebSocket.CLOSED
    relayRuntime.virtualSockets.delete(this.connectionId)
    const errorEvent = new Event('error')
    this.onerror?.(errorEvent)
    this.listeners.get('error')?.forEach((listener) => listener(errorEvent))
    const closeEvent = new CloseEvent('close', { code: 1011, reason: errorMessage, wasClean: false })
    this.onclose?.(closeEvent)
    this.listeners.get('close')?.forEach((listener) => listener(closeEvent))
  }

  getRequestId(): string {
    return this.requestId
  }

  getConnectionId(): string {
    return this.connectionId
  }

  getEndpoint(): string {
    return this.endpoint
  }
}

function encodeBase64(data: Uint8Array): string {
  let binary = ''
  data.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function relayErrorToUserMessage(code?: string, fallback?: string): string {
  if (code === 'DEVICE_NOT_FOUND') return '设备未在线，请先确认桌面端已连接中转服务'
  if (code === 'INVALID_PAIRING_KEY') return '配对码错误，请重新扫码或更新配对码'
  if (code === 'PAIRING_KEY_EXPIRED') return '配对码已过期，请在桌面端重新生成'
  if (code === 'PAIRING_COOLDOWN') return '尝试过于频繁，请稍后重试'
  if (code === 'RATE_LIMITED') return '请求过于频繁，请稍后重试'
  if (code === 'SESSION_EXPIRED') return '会话已过期，请重新连接'
  return fallback || '连接失败'
}

function handleRelayMessage(raw: string): void {
  let parsed:
    | RelayConnectResult
    | RelayHttpResponse
    | RelayWsOpenAck
    | RelayWsData
    | RelayWsClose
    | RelayError
  try {
    parsed = JSON.parse(raw) as
      | RelayConnectResult
      | RelayHttpResponse
      | RelayWsOpenAck
      | RelayWsData
      | RelayWsClose
      | RelayError
  } catch {
    return
  }
  if (parsed.type === 'HttpResponse') {
    const pending = relayRuntime.pending.get(parsed.request_id)
    if (!pending) return
    clearTimeout(pending.timeoutId)
    relayRuntime.pending.delete(parsed.request_id)
    pending.resolve(parsed)
    return
  }
  if (parsed.type === 'WsOpenAck') {
    const virtualSocket = relayRuntime.virtualSockets.get(parsed.connection_id)
    if (!virtualSocket || virtualSocket.getRequestId() !== parsed.request_id) return
    console.info('[relay-transport] ws_open_ack', {
      status: parsed.status,
      reason: parsed.reason || null,
      connectionId: parsed.connection_id,
    })
    virtualSocket.handleOpenAck(parsed.status, parsed.reason)
    if (parsed.status !== 'success') {
      relayRuntime.virtualSockets.delete(parsed.connection_id)
    }
    return
  }
  if (parsed.type === 'WsData') {
    const virtualSocket = relayRuntime.virtualSockets.get(parsed.connection_id)
    if (!virtualSocket) return
    virtualSocket.handleMessage(parsed.data, parsed.is_binary)
    return
  }
  if (parsed.type === 'WsClose') {
    const virtualSocket = relayRuntime.virtualSockets.get(parsed.connection_id)
    if (!virtualSocket) return
    virtualSocket.handleClose(parsed.code, parsed.reason)
    relayRuntime.virtualSockets.delete(parsed.connection_id)
    return
  }
  if (parsed.type === 'Error') {
    markRelayReconnectSuppressed(parsed.code)
    relayRuntime.connected = false
    relayRuntime.connecting = false
    relayRuntime.sessionId = null
    relayRuntime.sessionToken = null
    relayRuntime.lastError = relayErrorToUserMessage(parsed.code, parsed.message)
    console.error('[relay-transport] relay_error', {
      code: parsed.code || null,
      message: parsed.message || null,
      reconnectSuppressed: relayRuntime.reconnectSuppressed,
    })
    clearRelayHeartbeat()
    notifyRelayState()
    notifyTransportSnapshotChanged()
    flushConnectResolvers(new Error(parsed.code || parsed.message || 'RELAY_ERROR'))
    scheduleRelayReconnect()
    return
  }
  if (parsed.type === 'ConnectResult' && parsed.status === 'success') {
    releaseRelayReconnectSuppressed()
    relayRuntime.connected = true
    relayRuntime.connecting = false
    relayRuntime.sessionId = parsed.session_id || null
    relayRuntime.sessionToken = parsed.session_token || null
    relayRuntime.lastError = null
    console.info('[relay-transport] connect_success', {
      sessionId: relayRuntime.sessionId,
    })
    notifyRelayState()
    notifyTransportSnapshotChanged()
    flushConnectResolvers()
    if (!relayRuntime.heartbeatTimer && parsed.session_id) {
      relayRuntime.heartbeatTimer = setInterval(() => {
        if (!relayRuntime.ws || relayRuntime.ws.readyState !== WebSocket.OPEN || !relayRuntime.sessionId) {
          return
        }
        relayRuntime.ws.send(
          JSON.stringify({
            type: 'Heartbeat',
            session_id: relayRuntime.sessionId,
          })
        )
      }, 30000)
    }
    return
  }
  if (parsed.type === 'ConnectResult') {
    markRelayReconnectSuppressed(parsed.reason)
    relayRuntime.connected = false
    relayRuntime.connecting = false
    relayRuntime.sessionId = null
    relayRuntime.sessionToken = null
    relayRuntime.lastError = relayErrorToUserMessage(parsed.reason, parsed.reason || '连接失败')
    console.warn('[relay-transport] connect_failed', {
      reason: parsed.reason || null,
      reconnectSuppressed: relayRuntime.reconnectSuppressed,
    })
    clearRelayHeartbeat()
    notifyRelayState()
    notifyTransportSnapshotChanged()
    flushConnectResolvers(new Error(parsed.reason || '连接失败'))
    scheduleRelayReconnect()
  }
}

async function ensureRelayConnected(): Promise<void> {
  if (!isBrowser) throw new Error('BROWSER_REQUIRED')
  if (!shouldUseRelayTunnel()) throw new Error('RELAY_MODE_DISABLED')
  const settings = getStoredMobileRelaySettings()
  if (!settings) throw new Error('RELAY_SETTINGS_MISSING')
  if (relayRuntime.connected && relayRuntime.ws?.readyState === WebSocket.OPEN && relayRuntime.sessionToken) return
  if (relayRuntime.connecting) {
    await new Promise<void>((resolve, reject) => {
      relayRuntime.connectResolvers.push({ resolve, reject })
    })
    return
  }
  relayRuntime.connecting = true
  relayRuntime.lastError = null
  notifyRelayState()
  notifyTransportSnapshotChanged()
  clearRelayReconnect()
  if (relayRuntime.ws && relayRuntime.ws.readyState === WebSocket.OPEN) {
    relayRuntime.ws.close()
  }
  relayRuntime.ws = new WebSocket(settings.relayUrl)
  await new Promise<void>((resolve, reject) => {
    relayRuntime.connectResolvers.push({ resolve, reject })
    const ws = relayRuntime.ws
    if (!ws) {
      relayRuntime.connecting = false
      flushConnectResolvers(new Error('SOCKET_INIT_FAILED'))
      return
    }
    ws.onopen = () => {
      console.info('[relay-transport] socket_open', {
        relayUrl: settings.relayUrl,
        deviceId: settings.deviceId,
      })
      ws.send(
        JSON.stringify({
          type: 'Connect',
          device_id: settings.deviceId,
          pairing_key: settings.pairingKey,
          client_info: {
            device_type: 'mobile',
            device_name: settings.deviceName,
            platform: navigator.userAgent,
          },
        })
      )
    }
    ws.onmessage = (event) => {
      handleRelayMessage(String(event.data))
    }
    ws.onerror = () => {
      relayRuntime.connected = false
      relayRuntime.connecting = false
      relayRuntime.lastError = relayRuntime.lastError || '连接中转服务失败'
      clearRelayHeartbeat()
      relayRuntime.virtualSockets.forEach((socket) => socket.fail('连接中转服务失败'))
      relayRuntime.virtualSockets.clear()
      console.error('[relay-transport] socket_error', {
        reconnectSuppressed: relayRuntime.reconnectSuppressed,
        lastError: relayRuntime.lastError,
      })
      notifyRelayState()
      notifyTransportSnapshotChanged()
      flushConnectResolvers(new Error('RELAY_CONNECT_ERROR'))
      scheduleRelayReconnect()
    }
    ws.onclose = () => {
      relayRuntime.connected = false
      relayRuntime.connecting = false
      relayRuntime.sessionId = null
      relayRuntime.sessionToken = null
      relayRuntime.lastError = relayRuntime.lastError || '连接已断开'
      clearRelayHeartbeat()
      rejectPendingRequests('连接已关闭')
      relayRuntime.virtualSockets.forEach((socket) => socket.fail('连接已断开'))
      relayRuntime.virtualSockets.clear()
      console.warn('[relay-transport] socket_close', {
        reconnectSuppressed: relayRuntime.reconnectSuppressed,
        lastError: relayRuntime.lastError,
      })
      notifyRelayState()
      notifyTransportSnapshotChanged()
      flushConnectResolvers(new Error('RELAY_CLOSED'))
      scheduleRelayReconnect()
    }
    const timeout = setTimeout(() => {
      if (relayRuntime.connected) return
      relayRuntime.connecting = false
      relayRuntime.lastError = '连接超时'
      notifyRelayState()
      notifyTransportSnapshotChanged()
      ws.close()
      flushConnectResolvers(new Error('RELAY_CONNECT_TIMEOUT'))
      scheduleRelayReconnect()
    }, 8000)
    relayRuntime.connectResolvers.push({
      resolve: () => {
        clearTimeout(timeout)
        resolve()
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    })
  })
}

function normalizeRelayRealtimeTarget(endpoint: string): { pathname: string; query: string | null } | null {
  if (!endpoint) return null
  if (endpoint.startsWith('/api/')) {
    const [pathname, query = ''] = endpoint.split('?', 2)
    return { pathname, query: query || null }
  }
  let parsed: URL
  try {
    parsed = new URL(endpoint, isBrowser ? window.location.origin : 'http://localhost')
  } catch {
    return null
  }
  if (!parsed.pathname.startsWith('/api/')) return null
  return { pathname: parsed.pathname, query: parsed.search ? parsed.search.slice(1) : null }
}

function createRelayVirtualWebSocket(endpoint: string): TransportWebSocketLike {
  const target = normalizeRelayRealtimeTarget(endpoint)
  if (!target) {
    return new WebSocket(endpoint)
  }
  const requestId = `relay-ws-open-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const connectionId = `relay-conn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const socket = new RelayVirtualSocket(endpoint, connectionId, requestId)
  relayRuntime.virtualSockets.set(connectionId, socket)
  void (async () => {
    try {
      await ensureRelayConnected()
      if (!relayRuntime.ws || relayRuntime.ws.readyState !== WebSocket.OPEN || !relayRuntime.sessionToken) {
        throw new Error('RELAY_NOT_READY')
      }
      console.info('[relay-transport] ws_open_request', {
        url: target.pathname,
        query: target.query,
        connectionId,
      })
      relayRuntime.ws.send(
        JSON.stringify({
          type: 'WsOpen',
          request_id: requestId,
          session_token: relayRuntime.sessionToken,
          timestamp: Math.floor(Date.now() / 1000),
          connection_id: connectionId,
          url: target.pathname,
          query: target.query,
          headers: {},
        })
      )
      setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          relayRuntime.virtualSockets.delete(connectionId)
          socket.fail('WebSocket 连接超时')
        }
      }, 10000)
    } catch (error) {
      relayRuntime.virtualSockets.delete(connectionId)
      socket.fail(error instanceof Error ? error.message : 'WebSocket 连接失败')
    }
  })()
  return socket
}

export function createTransportWebSocket(endpoint: string): TransportWebSocketLike {
  if (!shouldUseRelayTunnel()) {
    return new WebSocket(endpoint)
  }
  return createRelayVirtualWebSocket(endpoint)
}

async function relayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = normalizeRelayTarget(input)
  if (!target) {
    if (!relayRuntime.originalFetch) {
      throw new Error('ORIGINAL_FETCH_MISSING')
    }
    return relayRuntime.originalFetch(input, init)
  }
  await ensureRelayConnected()
  if (!relayRuntime.ws || relayRuntime.ws.readyState !== WebSocket.OPEN || !relayRuntime.sessionToken) {
    throw new Error('RELAY_NOT_READY')
  }
  const requestId = `relay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const method =
    init?.method ||
    (typeof input !== 'string' && !(input instanceof URL) && input instanceof Request ? input.method : 'GET')
  const body = await extractRequestBody(input, init)
  const headers =
    init?.headers ||
    (typeof input !== 'string' && !(input instanceof URL) && input instanceof Request ? input.headers : undefined)
  const response = await new Promise<RelayHttpResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      relayRuntime.pending.delete(requestId)
      reject(new Error('RELAY_REQUEST_TIMEOUT'))
    }, 15000)
    relayRuntime.pending.set(requestId, { resolve, reject, timeoutId })
    relayRuntime.ws?.send(
      JSON.stringify({
        type: 'HttpRequest',
        request_id: requestId,
        session_token: relayRuntime.sessionToken,
        timestamp: Math.floor(Date.now() / 1000),
        method,
        url: target.pathname,
        query: target.query,
        headers: headersToObject(headers),
        body,
      })
    )
  })
  const responseHeaders = new Headers()
  if (response.headers) {
    Object.entries(response.headers).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
  }
  return new Response(response.body ?? '', {
    status: response.status,
    headers: responseHeaders,
  })
}

export function initializeMobileRelayTransport(): void {
  if (!isBrowser || relayRuntime.initialized) return
  relayRuntime.initialized = true
  relayRuntime.originalFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!isRelayFetchCandidate(input)) {
      return relayRuntime.originalFetch!(input, init)
    }
    return relayFetch(input, init)
  }) as typeof window.fetch
  const handleVisibility = () => {
    if (!isBrowser) return
    if (document.visibilityState === 'visible' && shouldUseRelayTunnel()) {
      void ensureRelayConnected()
      return
    }
    if (!shouldUseRelayTunnel()) {
      closeRelaySocket()
      clearRelayReconnect()
      notifyTransportSnapshotChanged()
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('online', () => {
    if (shouldUseRelayTunnel()) {
      if (relayRuntime.reconnectSuppressed) return
      void ensureRelayConnected()
    }
  })
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith('bee.mobile.')) return
    if (shouldUseRelayTunnel()) {
      releaseRelayReconnectSuppressed()
      void ensureRelayConnected()
      return
    }
    closeRelaySocket()
    clearRelayReconnect()
    notifyTransportSnapshotChanged()
  })
  if (shouldUseRelayTunnel()) {
    void ensureRelayConnected()
  }
  notifyTransportSnapshotChanged()
}

export function connectMobileRelayTransport(): Promise<void> {
  releaseRelayReconnectSuppressed()
  return ensureRelayConnected()
}

export function disconnectMobileRelayTransport(): void {
  closeRelaySocket()
  clearRelayReconnect()
  notifyTransportSnapshotChanged()
}

export function subscribeMobileRelayTransport(
  listener: (state: MobileRelayTransportState) => void
): () => void {
  relayRuntime.listeners.add(listener)
  listener(getRelayTransportState())
  return () => {
    relayRuntime.listeners.delete(listener)
  }
}

export async function requestMobileRelayTransport(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return relayFetch(path, init)
}

/**
 * 检测是否在 Tauri 桌面端环境中
 * - 桌面端 Tauri App 有 __TAURI__ 且不是移动端
 */
export function isTauriDesktop(): boolean {
  if (!isBrowser) return false
  if (!hasTauriRuntimeMarkers()) return false

  // 检测是否为移动端设备
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )

  return !isMobile
}

/**
 * 检测是否在 Tauri 移动端环境中
 * - 移动端 Tauri App 有 __TAURI__ 且是移动端
 */
export function isTauriMobile(): boolean {
  if (!isBrowser) return false
  if (!hasTauriRuntimeMarkers()) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tauri = (window as any).__TAURI__ as Record<string, unknown> | undefined

  // 检测 Tauri 平台类型（更可靠）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tauriApp = tauri?.app as any
  if (tauriApp) {
    // Tauri v2: 检查 app.name 或其他平台标识
    // 移动端通常会有特定的平台信息
  }

  // 回退到 userAgent 检测
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

/**
 * 检测是否在 Tauri 环境中 (包括桌面端和移动端)
 */
export function isTauriEnvironment(): boolean {
  return hasTauriRuntimeMarkers()
}

/**
 * 检测是否为移动端设备 (包括原生移动端和 Tauri 移动端)
 */
export function isMobileDevice(): boolean {
  if (!isBrowser) return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

/**
 * 检测是否为 Web 浏览器 (非 Tauri 环境)
 */
export function isWebBrowser(): boolean {
  return isBrowser && !isTauriEnvironment()
}

// ============ API URL 获取 ============

/**
 * 获取 API 基础 URL
 *
 * 优先级:
 * 1. NEXT_PUBLIC_API_BASE (手动指定)
 * 2. Tauri 桌面端 → localhost:3847 (Rust)
 * 3. 移动端开发模式 → 相对路径 (通过 rewrites 代理到 localhost:3847)
 * 4. 生产模式 → 云端 API
 * 5. Web 开发模式 → 相对路径 (通过 rewrites 代理)
 */
function getApiBase(): string {
  return getTransportSnapshot().apiBase
}

/**
 * 获取 WebSocket 基础 URL
 *
 * 优先级:
 * 1. NEXT_PUBLIC_WS_BASE (手动指定)
 * 2. Tauri 桌面端 → localhost:3847
 * 3. 移动端开发模式 → 局域网地址
 * 4. 生产模式 → 云端 WS
 * 5. Web 开发模式 → 当前 origin 的 ws
 */
function getWsBase(): string {
  return getTransportSnapshot().realtimeBase
}

function buildDefaultTransportBases(): { apiBase: string; realtimeBase: string } {
  if (envApiBase || envWsBase) {
    const apiBase = sanitizeHttpBase(envApiBase || '') || toHttpBaseFromWs(envWsBase || '')
    const realtimeBase = sanitizeWsBase(envWsBase || '') || toWsBaseFromHttp(envApiBase || '')
    return { apiBase, realtimeBase }
  }

  if (isTauriDesktop()) {
    const apiBase = `${browserHttpProtocol}://127.0.0.1:${TAURI_PORT}`
    const realtimeBase = `${browserWsProtocol}://127.0.0.1:${TAURI_PORT}`
    return { apiBase, realtimeBase }
  }

  const isMobile = isMobileDevice() || isTauriMobile()
  if (isMobile) {
    const savedBase = getStoredMobileDirectApiBase()
    if (savedBase) {
      return { apiBase: savedBase, realtimeBase: toWsBaseFromHttp(savedBase) }
    }
    if (process.env.NODE_ENV !== 'production') {
      return { apiBase: '', realtimeBase: LAN_WS_BASE }
    }
  }

  if (process.env.NODE_ENV === 'production') {
    const apiBase = sanitizeHttpBase(CLOUD_API_BASE) || toHttpBaseFromWs(CLOUD_WS_BASE)
    const realtimeBase = sanitizeWsBase(CLOUD_WS_BASE) || toWsBaseFromHttp(CLOUD_API_BASE)
    return { apiBase, realtimeBase }
  }

  if (isBrowser && window.location.origin) {
    const url = new URL(window.location.origin)
    url.protocol = browserWsProtocol
    return { apiBase: '', realtimeBase: url.toString().replace(/\/$/, '') }
  }

  const fallbackApiBase = `${browserHttpProtocol}://127.0.0.1:${TAURI_PORT}`
  const fallbackRealtimeBase = `${browserWsProtocol}://127.0.0.1:${TAURI_PORT}`
  return { apiBase: fallbackApiBase, realtimeBase: fallbackRealtimeBase }
}

export function getTransportSnapshot(): TransportSnapshot {
  if (shouldUseRelayTunnel()) {
    const settings = getStoredMobileRelaySettings()
    const relayRealtimeBase = settings?.relayUrl?.replace(/\/$/, '') || ''
    const apiBase = toHttpBaseFromWs(relayRealtimeBase)
    const directApiBase =
      getStoredMobileDirectApiBase() ||
      (process.env.NODE_ENV !== 'production' ? sanitizeApiBase(LAN_API_BASE) : '')
    const realtimeBase = directApiBase ? toWsBaseFromHttp(directApiBase) : relayRealtimeBase
    const mode: TransportMode = 'relay'
    return {
      mode,
      apiBase,
      realtimeBase,
      backendInstanceId: getBackendInstanceId(mode, apiBase, realtimeBase),
      sessionScope: relayRuntime.sessionId,
      connected: relayRuntime.connected,
    }
  }

  const mode: TransportMode = 'direct'
  const { apiBase, realtimeBase } = buildDefaultTransportBases()
  return {
    mode,
    apiBase,
    realtimeBase,
    backendInstanceId: getBackendInstanceId(mode, apiBase, realtimeBase),
    sessionScope: null,
    connected: true,
  }
}

export function subscribeTransportSnapshot(
  listener: (snapshot: TransportSnapshot) => void
): () => void {
  transportListeners.add(listener)
  const snapshot = getTransportSnapshot()
  lastTransportFingerprint = fingerprintTransportSnapshot(snapshot)
  listener(snapshot)
  return () => {
    transportListeners.delete(listener)
  }
}

function normalizeApiPath(path: string): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return path.startsWith('/') ? path : `/${path}`
}

function normalizeRealtimePath(path: string): string {
  if (!path) return ''
  if (/^wss?:\/\//.test(path)) return path
  return path.startsWith('/') ? path : `/${path}`
}

export function resolveHttpUrl(path: string): string {
  const normalizedPath = normalizeApiPath(path)
  if (/^https?:\/\//.test(normalizedPath)) return normalizedPath
  const snapshot = getTransportSnapshot()
  const normalizedApiBase = sanitizeHttpBase(snapshot.apiBase)
  if (!normalizedApiBase) {
    if (isTauriEnvironment()) {
      return `http://127.0.0.1:${TAURI_PORT}${normalizedPath}`
    }
    return normalizedPath
  }
  try {
    return new URL(normalizedPath, normalizedApiBase).toString().replace(/\/$/, '')
  } catch {
    if (typeof window !== 'undefined') {
      console.error('[api-config] resolveHttpUrl_failed', {
        path,
        normalizedPath,
        snapshotMode: snapshot.mode,
        snapshotApiBase: snapshot.apiBase,
        normalizedApiBase,
        locationOrigin: window.location.origin,
        envApiBase,
        envWsBase,
      })
    } else {
      console.error('[api-config] resolveHttpUrl_failed', {
        path,
        normalizedPath,
        snapshotMode: snapshot.mode,
        snapshotApiBase: snapshot.apiBase,
        normalizedApiBase,
        envApiBase,
        envWsBase,
      })
    }
    return `${normalizedApiBase}${normalizedPath}`
  }
}

export function resolveRealtimeUrl(path: string): string {
  const normalizedPath = normalizeRealtimePath(path)
  if (/^wss?:\/\//.test(normalizedPath)) return normalizedPath
  const snapshot = getTransportSnapshot()
  const normalizedRealtimeBase = sanitizeWsBase(snapshot.realtimeBase)
  if (!normalizedRealtimeBase) {
    if (isTauriEnvironment()) {
      return `${browserWsProtocol}://127.0.0.1:${TAURI_PORT}${normalizedPath}`
    }
    return normalizedPath
  }
  try {
    return new URL(normalizedPath, normalizedRealtimeBase).toString().replace(/\/$/, '')
  } catch {
    return `${normalizedRealtimeBase}${normalizedPath}`
  }
}

export { getApiBase, getWsBase }

export function getMobileConnectionMode(): MobileConnectionMode {
  return getStoredMobileConnectionMode() || 'direct'
}

export function setMobileConnectionMode(mode: MobileConnectionMode): void {
  if (!isBrowser) return
  window.localStorage.setItem(MOBILE_CONNECTION_MODE_KEY, mode)
  notifyTransportSnapshotChanged()
}

export function getMobileDirectApiBase(): string {
  const saved = getStoredMobileDirectApiBase()
  if (saved) return saved
  return sanitizeHttpBase(LAN_API_BASE)
}

export function setMobileDirectApiBase(value: string): void {
  if (!isBrowser) return
  const sanitized = sanitizeHttpBase(value)
  if (!sanitized) return
  window.localStorage.setItem(MOBILE_DIRECT_API_BASE_KEY, sanitized)
  notifyTransportSnapshotChanged()
}

// 导出环境检测函数供其他模块使用
export const environment = {
  isTauri: isTauriEnvironment,
  isTauriDesktop,
  isTauriMobile,
  isMobile: isMobileDevice,
  isWebBrowser,
}

/**
 * 判断当前是否应该使用远程后端
 * - 非 Tauri 桌面端 (Web 浏览器或移动端) 返回 true
 */
export function shouldUseRemoteBackend(): boolean {
  return !isTauriDesktop()
}
