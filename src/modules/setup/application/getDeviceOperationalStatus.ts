import { getProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { proxyRequest } from '@/src/shared/proxy/client'

import { getLatestProxyFiscalizationSignal } from '../infrastructure/deviceOperationalStatusRepo'

type AnyRecord = Record<string, unknown>

type ConnectionStatus = 'online' | 'offline' | 'unknown'
type PrinterStatus = ConnectionStatus | 'not_configured'

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return null
}

function findNestedValue(
  value: unknown,
  keys: readonly string[],
  maxDepth = 4,
): unknown {
  const wanted = new Set(keys.map((key) => key.toLowerCase()))
  const queue: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ]
  const seen = new Set<object>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || current.depth > maxDepth) continue
    if (!current.value || typeof current.value !== 'object') continue

    const object = current.value as Record<string, unknown>
    if (seen.has(object)) continue
    seen.add(object)

    for (const [key, nested] of Object.entries(object)) {
      if (wanted.has(key.toLowerCase()) && nested != null) return nested
      if (current.depth < maxDepth && nested && typeof nested === 'object') {
        queue.push({ value: nested, depth: current.depth + 1 })
      }
    }
  }

  return null
}

function normalizeLicenseStatus(value: unknown) {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()
  return text || null
}

function licenseStatusFromMessage(message: string | null) {
  if (!message || !/licen[cs]e/i.test(message)) return null
  const currentStatus = message.match(/current\s+status\s*:\s*([A-Za-z_-]+)/i)
  if (currentStatus?.[1]) return normalizeLicenseStatus(currentStatus[1])

  if (/\bexpired\b/i.test(message)) return 'EXPIRED'
  if (/\bactive\b/i.test(message)) return 'ACTIVE'
  if (/\binactive\b/i.test(message)) return 'INACTIVE'
  if (/\brevoked\b/i.test(message)) return 'REVOKED'
  return null
}

function buildLicenseStatus(
  registrationPayload: unknown,
  latestSignal: Awaited<ReturnType<typeof getLatestProxyFiscalizationSignal>>,
) {
  const registrationStatus = normalizeLicenseStatus(
    findNestedValue(registrationPayload, [
      'licenseStatus',
      'licenceStatus',
      'license_status',
      'licence_status',
    ]),
  )
  const registrationExpiry = firstText(
    findNestedValue(registrationPayload, [
      'licenseExpiresAt',
      'licenceExpiresAt',
      'licenseExpiry',
      'licenceExpiry',
      'licenseExpiryDate',
      'licenceExpiryDate',
      'expiresAt',
      'expiryDate',
      'expirationDate',
    ]),
  )

  let signalPayloadText: string | null = null
  try {
    signalPayloadText = latestSignal?.responsePayload
      ? JSON.stringify(latestSignal.responsePayload)
      : null
  } catch {
    signalPayloadText = null
  }
  const signalMessage = firstText(latestSignal?.errorMessage, signalPayloadText)
  const signalStatus = licenseStatusFromMessage(signalMessage)

  const status = registrationStatus ?? signalStatus
  const source = registrationStatus
    ? 'registration'
    : signalStatus
      ? 'fiscalization'
      : 'unknown'
  const expired = status === 'EXPIRED'
  const active = status === 'ACTIVE'

  return {
    status,
    expiresAt: registrationExpiry,
    expired,
    active,
    source,
    observedAt:
      source === 'fiscalization' && latestSignal?.occurredAt
        ? new Date(latestSignal.occurredAt).toISOString()
        : null,
    message:
      source === 'fiscalization' && signalStatus
        ? latestSignal?.errorMessage || null
        : null,
  }
}

function buildUpstreamConnection(value: unknown) {
  const entry = asRecord(value)
  const statusText = String(entry.status ?? '')
    .trim()
    .toLowerCase()
  const networkReachable =
    typeof entry.networkReachable === 'boolean'
      ? entry.networkReachable
      : null
  const connected =
    statusText === 'healthy' ||
    statusText === 'online' ||
    (networkReachable === true && statusText !== 'unhealthy')

  const status: ConnectionStatus = statusText
    ? connected
      ? 'online'
      : 'offline'
    : networkReachable == null
      ? 'unknown'
      : networkReachable
        ? 'online'
        : 'offline'

  return {
    status,
    connected: status === 'unknown' ? null : connected,
    statusCode:
      typeof entry.statusCode === 'number' ? entry.statusCode : null,
    responseTime:
      typeof entry.responseTime === 'number' ? entry.responseTime : null,
    dnsResolved:
      typeof entry.dnsResolved === 'boolean' ? entry.dnsResolved : null,
    networkReachable,
    url: firstText(entry.url),
    error: firstText(entry.error, entry.networkError),
  }
}

function buildPrinterStatus(
  heartbeat: Awaited<ReturnType<typeof getProcessHeartbeat>>,
) {
  const metrics = asRecord(heartbeat?.metrics)
  const configuredCount = Number(metrics.configuredCount ?? 0)
  const connectedCount = Number(metrics.connectedCount ?? 0)
  const heartbeatAt = heartbeat?.lastHeartbeatAt
    ? new Date(heartbeat.lastHeartbeatAt)
    : null
  const heartbeatAgeMs = heartbeatAt
    ? Date.now() - heartbeatAt.getTime()
    : Number.POSITIVE_INFINITY
  const stale = !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > 30_000

  let status: PrinterStatus = 'unknown'
  if (!stale && configuredCount <= 0) status = 'not_configured'
  else if (!stale && connectedCount > 0) status = 'online'
  else if (!stale && configuredCount > 0) status = 'offline'

  return {
    status,
    configured: configuredCount > 0,
    connected: status === 'online',
    configuredCount: Number.isFinite(configuredCount) ? configuredCount : 0,
    connectedCount: Number.isFinite(connectedCount) ? connectedCount : 0,
    lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null,
    stale,
    error: heartbeat?.lastError ?? null,
  }
}

export async function getDeviceOperationalStatus(input: {
  stationId: string
  registrationPayload: unknown
  registrationUrl?: string | null
}) {
  const [proxyHealth, printerHeartbeat, latestSignal] = await Promise.all([
    proxyRequest(input.stationId, {
      method: 'GET',
      path: '/proxy/health',
      fallbackPath: '/health',
      timeoutMs: 5_000,
    }).catch((error: unknown) => ({
      ok: false,
      status: 0,
      data: null,
      url: input.registrationUrl || '',
      error: error instanceof Error ? error.message : String(error),
    })),
    getProcessHeartbeat(input.stationId, 'printerConnectivityWorker').catch(
      () => null,
    ),
    getLatestProxyFiscalizationSignal(input.stationId).catch(() => null),
  ])

  const healthPayload = asRecord(proxyHealth.data)
  const connectivity = asRecord(healthPayload.connectivity)
  const timedOut =
    proxyHealth.status === 504 &&
    /timed out/i.test(String(asRecord(proxyHealth.data).message ?? ''))
  const proxyConnected = proxyHealth.status > 0 && !timedOut

  return {
    checkedAt: new Date().toISOString(),
    proxy: {
      status: proxyConnected ? 'online' : 'offline',
      connected: proxyConnected,
      url: firstText(proxyHealth.url, input.registrationUrl),
      health: firstText(healthPayload.proxy),
      error:
        'error' in proxyHealth
          ? firstText(proxyHealth.error)
          : !proxyHealth.ok
            ? firstText(asRecord(proxyHealth.data).message)
            : null,
    },
    internet: buildUpstreamConnection(connectivity.internet),
    network: buildUpstreamConnection(connectivity.network),
    printer: buildPrinterStatus(printerHeartbeat),
    license: buildLicenseStatus(input.registrationPayload, latestSignal),
  }
}
