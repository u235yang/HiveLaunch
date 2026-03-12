'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button } from '@shared/ui'
import { Camera, Copy, Loader2, PlugZap, QrCode, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import {
  connectMobileRelayTransport,
  disconnectMobileRelayTransport,
  getMobileConnectionMode,
  getMobileDirectApiBase,
  isMobileDevice,
  isTauriMobile,
  requestMobileRelayTransport,
  setMobileConnectionMode,
  setMobileDirectApiBase,
  subscribeMobileRelayTransport,
  type MobileConnectionMode,
} from '@/features/agent-execution/lib/api-config'
import {
  disableRemoteAccess,
  enableRemoteAccess,
  getDefaultMobileRelayWsUrl,
  getDefaultRelayWsUrl,
  getRemoteAccessStatus,
  regenerateRemoteAccessKey,
  removePairedDevice,
  updateDeviceName,
  type EnableRemoteAccessResponse,
  type RemoteAccessStatus,
} from '../lib/remote-access-api'

type MessageState = { type: 'success' | 'error'; text: string } | null

const MOBILE_RELAY_URL_KEY = 'bee.mobile.relay.url'
const MOBILE_RELAY_DEVICE_ID_KEY = 'bee.mobile.relay.deviceId'
const MOBILE_RELAY_PAIRING_KEY_KEY = 'bee.mobile.relay.pairingKey'
const MOBILE_RELAY_DEVICE_NAME_KEY = 'bee.mobile.relay.deviceName'

const initialStatus: RemoteAccessStatus = {
  enabled: false,
  deviceId: null,
  pairingKey: null,
  relayUrl: null,
  deviceName: null,
  connectionState: 'disabled',
  lastError: null,
  pairedDevices: [],
}

function isMobileEnvironment(): boolean {
  return isMobileDevice() || isTauriMobile()
}

function buildRemoteAccessLink(deviceId: string, pairingKey: string, relayUrl: string): string {
  const params = new URLSearchParams({
    device_id: deviceId,
    pairing_key: pairingKey,
    relay_url: relayUrl,
  })
  return `bee://remote-access?${params.toString()}`
}

type ParsedRemoteAccess = {
  deviceId: string
  pairingKey: string
  relayUrl?: string
}

interface RemoteAccessTexts {
  statusConnected: string
  statusConnecting: string
  statusReconnecting: string
  statusDisabled: string
  loadStatusError: string
  enabledSuccess: string
  enableFailed: string
  disabledSuccess: string
  disableFailed: string
  regenerateSuccess: string
  regenerateFailed: string
  desktopTestDisabled: string
  desktopTestSuccess: string
  desktopTestNotReadyPrefix: string
  desktopTestFailed: string
  removePairSuccess: string
  removePairFailed: string
  invalidQrContent: string
  scanRequireSecureContext: string
  scanNotSupported: string
  cameraInitFailed: string
  scanFailed: string
  cameraPermissionDenied: string
  cameraNotFound: string
  cameraUnavailable: string
  connectRelayFailed: string
  tunnelTestFailedNoSession: string
  tunnelTestFailedNeedConnect: string
  tunnelTestSuccess: string
  tunnelTestFailedHttpPrefix: string
  tunnelTestFailedNoResponse: string
  directAddressRequired: string
  directTestFailedPrefix: string
  directTestSuccess: string
  directTestFailedNetwork: string
  directAppliedPrefix: string
  loading: string
  desktopTitle: string
  notEnabled: string
  relayUrlLabel: string
  desktopDeviceNameLabel: string
  closeRemote: string
  openRemote: string
  testRemote: string
  resetKey: string
  deviceIdLabel: string
  pairingKeyLabel: string
  lastErrorLabel: string
  mobileScanConnect: string
  copyQrContent: string
  pairedDevicesTitle: string
  noPairedDevices: string
  cancelPairing: string
  mobilePairTitle: string
  modeDirect: string
  modeTunnelConnected: string
  modeTunnelDisconnected: string
  modeDirectButton: string
  modeRelayButton: string
  testDirect: string
  applyAddress: string
  desktopDeviceIdPlaceholder: string
  pairingKeyPlaceholder: string
  stopScan: string
  scanFill: string
  connectRelay: string
  disconnect: string
  testTunnel: string
  qrContentLabel: string
  qrContentPlaceholder: string
  parseQrContent: string
  sessionIdLabel: string
  sessionTokenLabel: string
}

const defaultTexts: RemoteAccessTexts = {
  statusConnected: 'Connected',
  statusConnecting: 'Connecting',
  statusReconnecting: 'Reconnecting',
  statusDisabled: 'Disabled',
  loadStatusError: 'Failed to load remote access status',
  enabledSuccess: 'Remote access enabled',
  enableFailed: 'Failed to enable remote access',
  disabledSuccess: 'Remote access disabled',
  disableFailed: 'Failed to disable remote access',
  regenerateSuccess: 'Generated a new pairing key',
  regenerateFailed: 'Failed to reset key',
  desktopTestDisabled: 'Remote access is disabled and cannot be tested',
  desktopTestSuccess: 'Remote service test passed: desktop is connected to relay',
  desktopTestNotReadyPrefix: 'Remote service is not ready, current status: ',
  desktopTestFailed: 'Remote service test failed',
  removePairSuccess: 'Paired device removed',
  removePairFailed: 'Failed to remove paired device',
  invalidQrContent: 'Invalid QR content',
  scanRequireSecureContext: 'Scanning requires HTTPS or localhost',
  scanNotSupported: 'Camera scanning is not supported in current environment, paste QR content manually',
  cameraInitFailed: 'Camera initialization failed',
  scanFailed: 'Scan failed, please retry',
  cameraPermissionDenied: 'Camera permission denied, allow camera access in system settings',
  cameraNotFound: 'No available camera detected',
  cameraUnavailable: 'Cannot access camera, please paste QR content manually',
  connectRelayFailed: 'Failed to connect relay service',
  tunnelTestFailedNoSession: 'Tunnel test failed: session not established',
  tunnelTestFailedNeedConnect: 'Tunnel test failed: complete remote service connection first',
  tunnelTestSuccess: 'Tunnel test passed: desktop API reachable',
  tunnelTestFailedHttpPrefix: 'Tunnel test failed: desktop returned HTTP ',
  tunnelTestFailedNoResponse: 'Tunnel test failed: no response from desktop (offline or timeout)',
  directAddressRequired: 'Please enter direct address first',
  directTestFailedPrefix: 'Direct test failed (HTTP ',
  directTestSuccess: 'Direct test passed',
  directTestFailedNetwork: 'Direct test failed, check IP, port, and network connectivity',
  directAppliedPrefix: 'Applied direct address: ',
  loading: 'Loading remote access config...',
  desktopTitle: 'Desktop Remote Access',
  notEnabled: 'Not enabled',
  relayUrlLabel: 'Relay URL',
  desktopDeviceNameLabel: 'Desktop Device Name',
  closeRemote: 'Disable Remote Connection',
  openRemote: 'Enable Remote Connection',
  testRemote: 'Test Remote Connection',
  resetKey: 'Reset Key',
  deviceIdLabel: 'Device ID',
  pairingKeyLabel: 'Pairing Key',
  lastErrorLabel: 'Last Error',
  mobileScanConnect: 'Scan on Mobile to Connect',
  copyQrContent: 'Copy QR Content',
  pairedDevicesTitle: 'Paired Devices',
  noPairedDevices: 'No paired devices',
  cancelPairing: 'Cancel Pairing',
  mobilePairTitle: 'Mobile Pairing & Connection',
  modeDirect: 'Direct IP Mode',
  modeTunnelConnected: 'Tunnel Connected',
  modeTunnelDisconnected: 'Remote Service Disconnected',
  modeDirectButton: 'Direct IP',
  modeRelayButton: 'Remote Service',
  testDirect: 'Test Direct',
  applyAddress: 'Apply Address',
  desktopDeviceIdPlaceholder: 'Desktop device_id',
  pairingKeyPlaceholder: '6-digit pairing key',
  stopScan: 'Stop Scan',
  scanFill: 'Scan to Fill',
  connectRelay: 'Connect Relay',
  disconnect: 'Disconnect',
  testTunnel: 'Test Tunnel',
  qrContentLabel: 'QR Content',
  qrContentPlaceholder: 'Paste bee://remote-access?... content and click parse',
  parseQrContent: 'Parse QR Content',
  sessionIdLabel: 'Session ID',
  sessionTokenLabel: 'Session Token',
}

function parseRemoteAccessPayload(raw: string): ParsedRemoteAccess | null {
  const text = raw.trim()
  if (!text) {
    return null
  }
  try {
    const url = new URL(text)
    if (url.protocol !== 'bee:') {
      return null
    }
    if (url.hostname !== 'remote-access') {
      return null
    }
    const deviceId = url.searchParams.get('device_id') || ''
    const pairingKey = url.searchParams.get('pairing_key') || ''
    const relayUrl = url.searchParams.get('relay_url') || undefined
    if (!deviceId || !pairingKey) {
      return null
    }
    return { deviceId, pairingKey, relayUrl }
  } catch {
    return null
  }
}

interface RemoteAccessSectionProps {
  texts?: RemoteAccessTexts
}

export function RemoteAccessSection({ texts = defaultTexts }: RemoteAccessSectionProps) {
  const statusLabel = (state: string): string => {
    if (state === 'connected') return texts.statusConnected
    if (state === 'connecting') return texts.statusConnecting
    if (state === 'reconnecting') return texts.statusReconnecting
    if (state === 'disabled') return texts.statusDisabled
    return state
  }

  const readStoredValue = (key: string, fallback: string) => {
    if (typeof window === 'undefined') {
      return fallback
    }
    return window.localStorage.getItem(key) || fallback
  }

  const [status, setStatus] = useState<RemoteAccessStatus>(initialStatus)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [desktopTestPending, setDesktopTestPending] = useState(false)
  const [message, setMessage] = useState<MessageState>(null)
  const [relayUrl, setRelayUrl] = useState(getDefaultRelayWsUrl())
  const [deviceName, setDeviceName] = useState('')
  const [deviceNamePending, setDeviceNamePending] = useState(false)
  const [mobileRelayUrl, setMobileRelayUrl] = useState(() =>
    readStoredValue(MOBILE_RELAY_URL_KEY, getDefaultMobileRelayWsUrl())
  )
  const [mobileConnectionMode, setMobileConnectionModeState] = useState<MobileConnectionMode>(() =>
    getMobileConnectionMode()
  )
  const [mobileDirectApiBase, setMobileDirectApiBaseState] = useState(() => getMobileDirectApiBase())
  const [mobileDirectPending, setMobileDirectPending] = useState(false)
  const [mobileDirectStatus, setMobileDirectStatus] = useState<string | null>(null)
  const [mobileDeviceId, setMobileDeviceId] = useState(() => readStoredValue(MOBILE_RELAY_DEVICE_ID_KEY, ''))
  const [mobilePairingKey, setMobilePairingKey] = useState(() =>
    readStoredValue(MOBILE_RELAY_PAIRING_KEY_KEY, '')
  )
  const [mobileDeviceName, setMobileDeviceName] = useState(() =>
    readStoredValue(MOBILE_RELAY_DEVICE_NAME_KEY, 'Bee Mobile')
  )
  const [mobileConnected, setMobileConnected] = useState(false)
  const [mobileRelayTestPending, setMobileRelayTestPending] = useState(false)
  const [mobileRelayTestStatus, setMobileRelayTestStatus] = useState<string | null>(null)
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null)
  const [mobileSessionToken, setMobileSessionToken] = useState<string | null>(null)
  const [mobileError, setMobileError] = useState<string | null>(null)
  const [desktopQrPayload, setDesktopQrPayload] = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanStreamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mobileMode = useMemo(() => isMobileEnvironment(), [])

  const normalizeApiBase = (value: string) => value.trim().replace(/\/$/, '')

  const loadStatus = async () => {
    try {
      const data = await getRemoteAccessStatus()
      setStatus(data)
      if (data.relayUrl) {
        setRelayUrl(data.relayUrl)
      }
      if (data.deviceName) {
        setDeviceName(data.deviceName)
      }
      if (data.deviceId && data.pairingKey && data.relayUrl) {
        setDesktopQrPayload(buildRemoteAccessLink(data.deviceId, data.pairingKey, data.relayUrl))
      } else {
        setDesktopQrPayload('')
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.loadStatusError
      setMessage({ type: 'error', text })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current)
      }
      if (scanStreamRef.current) {
        scanStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (!mobileMode) {
      return
    }
    return subscribeMobileRelayTransport((relayState) => {
      setMobileConnected(relayState.connected)
      setMobileSessionId(relayState.sessionId)
      setMobileSessionToken(relayState.hasSessionToken ? '***' : null)
      if (relayState.lastError) {
        setMobileError(relayState.lastError)
      }
    })
  }, [mobileMode])

  useEffect(() => {
    if (!mobileMode || mobileConnectionMode !== 'relay') {
      return
    }
    void connectMobileRelayTransport()
  }, [mobileConnectionMode, mobileMode])

  useEffect(() => {
    if (!mobileMode) {
      return
    }
    setMobileConnectionMode(mobileConnectionMode)
  }, [mobileConnectionMode, mobileMode])

  useEffect(() => {
    if (!mobileMode) {
      return
    }
    setMobileDirectApiBase(mobileDirectApiBase)
  }, [mobileDirectApiBase, mobileMode])

  useEffect(() => {
    if (!mobileMode || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(MOBILE_RELAY_URL_KEY, mobileRelayUrl)
  }, [mobileMode, mobileRelayUrl])

  useEffect(() => {
    if (!mobileMode || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(MOBILE_RELAY_DEVICE_ID_KEY, mobileDeviceId)
  }, [mobileDeviceId, mobileMode])

  useEffect(() => {
    if (!mobileMode || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(MOBILE_RELAY_PAIRING_KEY_KEY, mobilePairingKey)
  }, [mobileMode, mobilePairingKey])

  useEffect(() => {
    if (!mobileMode || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(MOBILE_RELAY_DEVICE_NAME_KEY, mobileDeviceName)
  }, [mobileDeviceName, mobileMode])

  const handleEnable = async () => {
    setPending(true)
    setMessage(null)
    try {
      const result: EnableRemoteAccessResponse = await enableRemoteAccess({
        relayUrl,
        deviceName,
      })
      setStatus((prev) => ({
        ...prev,
        enabled: true,
        deviceId: result.deviceId,
        pairingKey: result.pairingKey,
        relayUrl,
      }))
      setDesktopQrPayload(
        result.qrCodeUrl || buildRemoteAccessLink(result.deviceId, result.pairingKey, relayUrl)
      )
      setMessage({ type: 'success', text: texts.enabledSuccess })
      await loadStatus()
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.enableFailed
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }

  const handleDisable = async () => {
    setPending(true)
    setMessage(null)
    try {
      await disableRemoteAccess()
      setDesktopQrPayload('')
      setMessage({ type: 'success', text: texts.disabledSuccess })
      await loadStatus()
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.disableFailed
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }

  const handleRegenerate = async () => {
    setPending(true)
    setMessage(null)
    try {
      const result = await regenerateRemoteAccessKey()
      setStatus((prev) => ({
        ...prev,
        pairingKey: result.pairingKey,
        deviceId: result.deviceId,
      }))
      setDesktopQrPayload(
        result.qrCodeUrl || buildRemoteAccessLink(result.deviceId, result.pairingKey, status.relayUrl || relayUrl)
      )
      setMessage({ type: 'success', text: texts.regenerateSuccess })
      await loadStatus()
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.regenerateFailed
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }

  const handleUpdateDeviceName = async () => {
    if (!deviceName.trim()) {
      setMessage({ type: 'error', text: 'Device name cannot be empty' })
      return
    }
    setDeviceNamePending(true)
    setMessage(null)
    try {
      await updateDeviceName(deviceName.trim())
      setStatus((prev) => ({
        ...prev,
        deviceName: deviceName.trim(),
      }))
      setMessage({ type: 'success', text: 'Device name updated' })
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to update device name'
      setMessage({ type: 'error', text })
    } finally {
      setDeviceNamePending(false)
    }
  }

  const handleDesktopTest = async () => {
    setDesktopTestPending(true)
    setMessage(null)
    try {
      const data = await getRemoteAccessStatus()
      if (!data.enabled) {
        setMessage({ type: 'error', text: texts.desktopTestDisabled })
        return
      }
      if (data.connectionState === 'connected') {
        setMessage({ type: 'success', text: texts.desktopTestSuccess })
        return
      }
      setMessage({ type: 'error', text: `${texts.desktopTestNotReadyPrefix}${statusLabel(data.connectionState)}` })
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.desktopTestFailed
      setMessage({ type: 'error', text })
    } finally {
      setDesktopTestPending(false)
    }
  }

  const handleRemovePair = async (deviceId: string) => {
    setPending(true)
    setMessage(null)
    try {
      await removePairedDevice(deviceId)
      setMessage({ type: 'success', text: texts.removePairSuccess })
      await loadStatus()
    } catch (error) {
      const text = error instanceof Error ? error.message : texts.removePairFailed
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }

  const disconnectMobileRelay = () => {
    disconnectMobileRelayTransport()
    setMobileConnected(false)
    setMobileSessionId(null)
    setMobileSessionToken(null)
    setMobileRelayTestStatus(null)
  }

  const stopScan = () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }
    if (scanStreamRef.current) {
      scanStreamRef.current.getTracks().forEach((track) => track.stop())
      scanStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }

  const applyScanPayload = (raw: string) => {
    const parsed = parseRemoteAccessPayload(raw)
    if (!parsed) {
      setScanError(texts.invalidQrContent)
      return false
    }
    setMobileDeviceId(parsed.deviceId)
    setMobilePairingKey(parsed.pairingKey)
    if (parsed.relayUrl) {
      setMobileRelayUrl(parsed.relayUrl)
    }
    setScanError(null)
    setScanInput(raw)
    return true
  }

  const startScan = async () => {
    setScanError(null)
    const tauriMobileRuntime = isTauriMobile()
    if (!tauriMobileRuntime && !(window.isSecureContext || location.hostname === 'localhost')) {
      setScanError(texts.scanRequireSecureContext)
      return
    }
    const detectorCtor = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
    if (!detectorCtor) {
      setScanError(texts.scanNotSupported)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      scanStreamRef.current = stream
      if (!videoRef.current) {
        setScanError(texts.cameraInitFailed)
        stopScan()
        return
      }
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      const detector = new detectorCtor({ formats: ['qr_code'] })
      setIsScanning(true)
      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          return
        }
        try {
          const results = await detector.detect(videoRef.current)
          const value = results[0]?.rawValue
          if (value && applyScanPayload(value)) {
            stopScan()
          }
        } catch {
          setScanError(texts.scanFailed)
          stopScan()
        }
      }, 500)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setScanError(texts.cameraPermissionDenied)
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setScanError(texts.cameraNotFound)
      } else {
        setScanError(texts.cameraUnavailable)
      }
      stopScan()
    }
  }

  const desktopQrImageUrl = useMemo(() => {
    if (!desktopQrPayload) {
      return ''
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(desktopQrPayload)}`
  }, [desktopQrPayload])

  const connectMobileRelay = async () => {
    setMobileError(null)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MOBILE_RELAY_URL_KEY, mobileRelayUrl)
      window.localStorage.setItem(MOBILE_RELAY_DEVICE_ID_KEY, mobileDeviceId)
      window.localStorage.setItem(MOBILE_RELAY_PAIRING_KEY_KEY, mobilePairingKey)
      window.localStorage.setItem(MOBILE_RELAY_DEVICE_NAME_KEY, mobileDeviceName)
    }
    try {
      await connectMobileRelayTransport()
      setMobileRelayTestStatus(null)
    } catch (error) {
      setMobileConnected(false)
      setMobileError(error instanceof Error ? error.message : texts.connectRelayFailed)
      setMobileRelayTestStatus(texts.tunnelTestFailedNoSession)
    }
  }

  const testMobileRelayConnection = async () => {
    if (!mobileConnected || !mobileSessionId) {
      setMobileRelayTestStatus(texts.tunnelTestFailedNeedConnect)
      return
    }
    setMobileRelayTestPending(true)
    setMobileRelayTestStatus(null)
    try {
      const response = await requestMobileRelayTransport('/api/remote-access/status', {
        method: 'GET',
        headers: { accept: 'application/json' },
      })
      if (response.status >= 200 && response.status < 300) {
        setMobileRelayTestStatus(texts.tunnelTestSuccess)
      } else {
        setMobileRelayTestStatus(`${texts.tunnelTestFailedHttpPrefix}${response.status}`)
      }
    } catch {
      setMobileRelayTestStatus(texts.tunnelTestFailedNoResponse)
    } finally {
      setMobileRelayTestPending(false)
    }
  }

  const testDirectConnection = async () => {
    const base = normalizeApiBase(mobileDirectApiBase)
    if (!base) {
      setMobileDirectStatus(texts.directAddressRequired)
      return
    }
    setMobileDirectPending(true)
    setMobileDirectStatus(null)
    try {
      const response = await fetch(`${base}/api/remote-access/status`)
      if (!response.ok) {
        setMobileDirectStatus(`${texts.directTestFailedPrefix}${response.status})`)
        return
      }
      setMobileDirectStatus(texts.directTestSuccess)
    } catch {
      setMobileDirectStatus(texts.directTestFailedNetwork)
    } finally {
      setMobileDirectPending(false)
    }
  }

  const applyDirectApiBase = () => {
    const base = normalizeApiBase(mobileDirectApiBase)
    if (!base) {
      setMobileDirectStatus(texts.directAddressRequired)
      return
    }
    setMobileDirectApiBaseState(base)
    setMobileDirectApiBase(base)
    setMobileConnectionModeState('direct')
    setMobileConnectionMode('direct')
    disconnectMobileRelay()
    setMobileDirectStatus(`${texts.directAppliedPrefix}${base}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {texts.loading}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!mobileMode && (
        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">{texts.desktopTitle}</h3>
            </div>
            <Badge variant={status.enabled ? 'default' : 'secondary'}>
              {status.enabled ? statusLabel(status.connectionState) : texts.notEnabled}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">{texts.relayUrlLabel}</label>
              <input
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="ws://127.0.0.1:3848/ws"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{texts.desktopDeviceNameLabel}</label>
              <div className="flex gap-2">
                <input
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="Bee Desktop"
                />
                {status.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUpdateDeviceName()}
                    disabled={deviceNamePending || !deviceName.trim()}
                  >
                    {deviceNamePending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void (status.enabled ? handleDisable() : handleEnable())} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              {status.enabled ? texts.closeRemote : texts.openRemote}
            </Button>
            <Button variant="outline" onClick={() => void handleDesktopTest()} disabled={desktopTestPending}>
              {desktopTestPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {texts.testRemote}
            </Button>
            <Button variant="outline" onClick={handleRegenerate} disabled={pending || !status.enabled}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {texts.resetKey}
            </Button>
          </div>
          <div className="mt-4 grid gap-2 rounded-md border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
            <div>{texts.deviceIdLabel}: {status.deviceId || '-'}</div>
            <div>{texts.pairingKeyLabel}: {status.pairingKey || '-'}</div>
            <div>{texts.lastErrorLabel}: {status.lastError || '-'}</div>
          </div>
          {status.enabled && desktopQrPayload && (
            <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <QrCode className="h-4 w-4" />
                {texts.mobileScanConnect}
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <img src={desktopQrImageUrl} alt="remote-access-qr" className="h-44 w-44 rounded border border-border bg-background p-1" />
                <div className="flex-1 space-y-2 text-xs text-muted-foreground">
                  <div className="break-all rounded border border-border bg-background p-2 text-foreground">{desktopQrPayload}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(desktopQrPayload)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {texts.copyQrContent}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!mobileMode && (
        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <h3 className="mb-3 text-base font-semibold">{texts.pairedDevicesTitle}</h3>
          {status.pairedDevices.length === 0 ? (
            <div className="text-sm text-muted-foreground">{texts.noPairedDevices}</div>
          ) : (
            <div className="space-y-2">
              {status.pairedDevices.map((device) => (
                <div key={device.deviceId} className="flex items-center justify-between rounded-md border border-border bg-background/70 p-3">
                  <div className="text-sm">
                    <div className="font-medium">{device.deviceName}</div>
                    <div className="text-muted-foreground">ID: {device.deviceId}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRemovePair(device.deviceId)}
                    disabled={pending}
                  >
                    {texts.cancelPairing}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mobileMode && (
        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">{texts.mobilePairTitle}</h3>
            </div>
            <Badge variant={mobileConnectionMode === 'direct' ? 'default' : mobileConnected ? 'default' : 'secondary'}>
              {mobileConnectionMode === 'direct' ? texts.modeDirect : mobileConnected ? texts.modeTunnelConnected : texts.modeTunnelDisconnected}
            </Badge>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              variant={mobileConnectionMode === 'direct' ? 'default' : 'outline'}
              onClick={() => {
                disconnectMobileRelay()
                stopScan()
                setScanError(null)
                setMobileError(null)
                setMobileConnectionModeState('direct')
              }}
            >
              {texts.modeDirectButton}
            </Button>
            <Button
              variant={mobileConnectionMode === 'relay' ? 'default' : 'outline'}
              onClick={() => {
                setMobileDirectStatus(null)
                setMobileConnectionModeState('relay')
              }}
            >
              {texts.modeRelayButton}
            </Button>
          </div>
          {mobileConnectionMode === 'direct' ? (
            <div>
              <div className="grid gap-3">
                <input
                  value={mobileDirectApiBase}
                  onChange={(e) => setMobileDirectApiBaseState(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="http://192.168.2.6:3847"
                />
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => void testDirectConnection()} disabled={mobileDirectPending}>
                  {mobileDirectPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  {texts.testDirect}
                </Button>
                <Button onClick={applyDirectApiBase}>{texts.applyAddress}</Button>
              </div>
              {mobileDirectStatus && (
                <div className="mt-3 rounded-md border border-border bg-muted/60 p-3 text-sm text-muted-foreground">{mobileDirectStatus}</div>
              )}
            </div>
          ) : (
            <div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={mobileRelayUrl}
                  onChange={(e) => setMobileRelayUrl(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="ws://relay-host:3848/ws"
                />
                <input
                  value={mobileDeviceName}
                  onChange={(e) => setMobileDeviceName(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="Bee Mobile"
                />
                <input
                  value={mobileDeviceId}
                  onChange={(e) => setMobileDeviceId(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder={texts.desktopDeviceIdPlaceholder}
                />
                <input
                  value={mobilePairingKey}
                  onChange={(e) => setMobilePairingKey(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder={texts.pairingKeyPlaceholder}
                />
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={isScanning ? stopScan : () => void startScan()}>
                  <Camera className="mr-1 h-4 w-4" />
                  {isScanning ? texts.stopScan : texts.scanFill}
                </Button>
                <Button
                  onClick={() => void connectMobileRelay()}
                  disabled={!mobileDeviceId || !mobilePairingKey || !mobileRelayUrl || mobileConnected}
                >
                  {texts.connectRelay}
                </Button>
                <Button variant="outline" onClick={disconnectMobileRelay} disabled={!mobileConnected}>
                  {texts.disconnect}
                </Button>
                <Button variant="outline" onClick={() => void testMobileRelayConnection()} disabled={mobileRelayTestPending}>
                  {mobileRelayTestPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  {texts.testTunnel}
                </Button>
              </div>
              <div className={`mt-3 overflow-hidden rounded-md border bg-black ${isScanning ? '' : 'hidden'}`}>
                <video ref={videoRef} className="h-56 w-full object-cover" autoPlay muted playsInline />
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
                <div className="mb-2 text-xs font-medium text-foreground">{texts.qrContentLabel}</div>
                <textarea
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
                  placeholder={texts.qrContentPlaceholder}
                />
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      applyScanPayload(scanInput)
                    }}
                  >
                    {texts.parseQrContent}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 rounded-md border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
            <div>{texts.sessionIdLabel}: {mobileSessionId || '-'}</div>
            <div>{texts.sessionTokenLabel}: {mobileSessionToken ? `${mobileSessionToken.slice(0, 12)}...` : '-'}</div>
            {mobileRelayTestStatus && <div className="mt-1 text-foreground">{mobileRelayTestStatus}</div>}
            {mobileError && <div className="mt-1 text-red-600 dark:text-red-400">{mobileError}</div>}
            {scanError && <div className="mt-1 text-red-600 dark:text-red-400">{scanError}</div>}
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
