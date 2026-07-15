import os from 'node:os'

export type ForecourtRuntimeMode = 'jpl_tcp'

export const FORECOURT_RUNTIME_KV_KEYS = {
  JPL_OPERATION_MODE: 'env:JPL_OPERATION_MODE',
  JPL_HOST: 'env:JPL_TCP_HOST',
  JPL_PORT: 'env:JPL_TCP_PORT',
  JPL_POS_ID: 'env:JPL_POS_ID',
  JPL_FC_ACCESS_CODE: 'env:JPL_FC_ACCESS_CODE',
  JPL_COUNTRY_CODE: 'env:JPL_COUNTRY_CODE',
  JPL_POS_VERSION_ID: 'env:JPL_POS_VERSION_ID',
  JPL_UNSOLICITED_DR_SECONDS: 'env:JPL_UNSOLICITED_DR_SECONDS',
  JPL_HEARTBEAT_INTERVAL_MS: 'env:JPL_HEARTBEAT_INTERVAL_MS',
  JPL_DEAD_CONNECTION_TIMEOUT_MS: 'env:JPL_DEAD_CONNECTION_TIMEOUT_MS',
  JPL_EXPECTED_MIN_VERSION: 'env:JPL_EXPECTED_MIN_VERSION',
  JPL_UNSOLICITED_FLAGS: 'env:JPL_UNSOLICITED_FLAGS',
  JPL_UNSOLICITED_MFDR_FLAGS: 'env:JPL_UNSOLICITED_MFDR_FLAGS',
  JPL_STATUS_UPDATE_CODE: 'env:JPL_STATUS_UPDATE_CODE',
  JPL_BOOTSTRAP_SNAPSHOT_ENABLED: 'env:JPL_BOOTSTRAP_SNAPSHOT_ENABLED',
  JPL_INTEGRATION_SCOPE: 'env:JPL_INTEGRATION_SCOPE',
  JPL_TLS_REQUIRED: 'env:JPL_TLS_REQUIRED',
  JPL_TLS_REJECT_UNAUTHORIZED: 'env:JPL_TLS_REJECT_UNAUTHORIZED',
  JPL_TLS_SERVERNAME: 'env:JPL_TLS_SERVERNAME',
  JPL_TLS_CA_PATH: 'env:JPL_TLS_CA_PATH',
  JPL_TLS_CLIENT_CERT_PATH: 'env:JPL_TLS_CLIENT_CERT_PATH',
  JPL_TLS_CLIENT_KEY_PATH: 'env:JPL_TLS_CLIENT_KEY_PATH',
  JPL_TLS_MIN_VERSION: 'env:JPL_TLS_MIN_VERSION',
  JPL_OPTIONAL_PROTOCOL_FAMILIES: 'env:JPL_OPTIONAL_PROTOCOL_FAMILIES',

  // Buffer health thresholds (DB override)
  BUFFER_WARN_DEPTH_SUP: 'env:BUFFER_WARN_DEPTH_SUP',
  BUFFER_CRIT_DEPTH_SUP: 'env:BUFFER_CRIT_DEPTH_SUP',
  BUFFER_WARN_AGE_MIN_SUP: 'env:BUFFER_WARN_AGE_MIN_SUP',
  BUFFER_CRIT_AGE_MIN_SUP: 'env:BUFFER_CRIT_AGE_MIN_SUP',
  BUFFER_WARN_DEPTH_UNSUP: 'env:BUFFER_WARN_DEPTH_UNSUP',
  BUFFER_CRIT_DEPTH_UNSUP: 'env:BUFFER_CRIT_DEPTH_UNSUP',
  BUFFER_WARN_AGE_MIN_UNSUP: 'env:BUFFER_WARN_AGE_MIN_UNSUP',
  BUFFER_CRIT_AGE_MIN_UNSUP: 'env:BUFFER_CRIT_AGE_MIN_UNSUP',
} as const

export type JplOperationMode = 'unsupervised' | 'supervised'

export const normalizeJplOperationMode = (value: unknown): JplOperationMode => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()

  if (raw === 'supervised' || raw === 'sup') return 'supervised'
  return 'unsupervised'
}

export const parseCsvStringList = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

export const normalizeBooleanFlag = (value: unknown, fallback: boolean) => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false
  return fallback
}

export const DEFAULT_JPL_OPTIONAL_PROTOCOL_FAMILIES = [
  'price-poles',
  'wash',
  'digital-io',
  'serial-server',
  'sensors',
  'vending',
] as const

export type JplOptionalProtocolFamily =
  (typeof DEFAULT_JPL_OPTIONAL_PROTOCOL_FAMILIES)[number]

const JPL_OPTIONAL_PROTOCOL_FAMILY_ALIASES: Record<
  string,
  JplOptionalProtocolFamily
> = {
  'price-pole': 'price-poles',
  'price-poles': 'price-poles',
  pp: 'price-poles',
  wash: 'wash',
  'car-wash': 'wash',
  'digital-io': 'digital-io',
  dio: 'digital-io',
  diop: 'digital-io',
  'serial-server': 'serial-server',
  serial: 'serial-server',
  sensors: 'sensors',
  sensor: 'sensors',
  vending: 'vending',
  vm: 'vending',
}

export const normalizeProtocolFamilyList = (
  value: unknown,
  fallback: readonly JplOptionalProtocolFamily[] = DEFAULT_JPL_OPTIONAL_PROTOCOL_FAMILIES,
): JplOptionalProtocolFamily[] => {
  const raw = parseCsvStringList(value)
  if (!raw.length) return [...fallback]

  const normalized = raw
    .map(
      (entry) =>
        JPL_OPTIONAL_PROTOCOL_FAMILY_ALIASES[
          entry.trim().toLowerCase().replace(/_/g, '-')
        ],
    )
    .filter(Boolean) as JplOptionalProtocolFamily[]

  return [...new Set(normalized)]
}

export const toInt = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''))
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export const normalizeForecourtMode = (_value: unknown): ForecourtRuntimeMode =>
  'jpl_tcp'

export const normalizeForecourtHost = (value: unknown, fallback: string) => {
  const host = String(value ?? '').trim()
  return host.length ? host : fallback
}

export const getPreferredNetworkHost = (
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
) => {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (
        entry.family === 'IPv4' &&
        !entry.internal &&
        entry.address &&
        entry.address !== '0.0.0.0'
      ) {
        return entry.address
      }
    }
  }

  return '127.0.0.1'
}

const isLoopbackHost = (value: string) => {
  const host = value.trim().toLowerCase()
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '::'
  )
}

export const resolveProductionHost = (
  value: unknown,
  fallback: string,
  isProduction = process.env.NODE_ENV === 'production',
) => {
  const host = String(value ?? '').trim()
  if (!host) return fallback
  if (isProduction && isLoopbackHost(host)) {
    return fallback
  }
  return host
}

export const normalizeForecourtPort = (value: unknown, fallback: number) => {
  const n = toInt(value, fallback)
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return fallback
  return n
}
