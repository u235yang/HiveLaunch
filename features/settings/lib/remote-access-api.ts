import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

const DEFAULT_REMOTE_RELAY_WS_URL = 'ws://relay.yuantianze.com:3848/ws'

export interface RemotePairedDevice {
  deviceId: string
  deviceName: string
  pairedAt: string
  lastSeen: string | null
}

export interface RemoteAccessStatus {
  enabled: boolean
  deviceId: string | null
  pairingKey: string | null
  relayUrl: string | null
  deviceName: string | null
  connectionState: string
  lastError: string | null
  pairedDevices: RemotePairedDevice[]
}

export interface EnableRemoteAccessPayload {
  relayUrl?: string
  deviceName?: string
}

export interface EnableRemoteAccessResponse {
  deviceId: string
  pairingKey: string
  qrCodeUrl: string
}

async function request<T>(endpoint: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(resolveHttpUrl(endpoint), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export function getDefaultRelayWsUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_REMOTE_RELAY_WS_URL
  if (fromEnv) {
    return fromEnv
  }
  return DEFAULT_REMOTE_RELAY_WS_URL
}

export function getDefaultMobileRelayWsUrl(): string {
  const base = process.env.NEXT_PUBLIC_REMOTE_RELAY_WS_URL || DEFAULT_REMOTE_RELAY_WS_URL
  if (base.endsWith('/ws')) {
    return base
  }
  return `${base.replace(/\/$/, '')}/ws`
}

export async function getRemoteAccessStatus(): Promise<RemoteAccessStatus> {
  return request<RemoteAccessStatus>('/api/remote-access/status', 'GET')
}

export async function enableRemoteAccess(
  payload: EnableRemoteAccessPayload
): Promise<EnableRemoteAccessResponse> {
  return request<EnableRemoteAccessResponse>('/api/remote-access/enable', 'POST', payload)
}

export async function disableRemoteAccess(): Promise<void> {
  await request('/api/remote-access/disable', 'POST')
}

export async function regenerateRemoteAccessKey(): Promise<EnableRemoteAccessResponse> {
  return request<EnableRemoteAccessResponse>('/api/remote-access/regenerate-key', 'POST')
}

export async function removePairedDevice(deviceId: string): Promise<void> {
  await request(`/api/remote-access/paired/${encodeURIComponent(deviceId)}`, 'DELETE')
}

export async function updateDeviceName(deviceName: string): Promise<void> {
  await request('/api/remote-access/device-name', 'POST', { deviceName })
}
