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

export const normalizeForecourtPort = (value: unknown, fallback: number) => {
  const n = toInt(value, fallback)
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return fallback
  return n
}
