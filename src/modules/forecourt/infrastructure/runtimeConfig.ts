import {
  FORECOURT_RUNTIME_KV_KEYS as KEY,
  normalizeBooleanFlag,
  normalizeForecourtHost,
  normalizeForecourtPort,
  normalizeJplOperationMode,
  parseCsvStringList,
  toInt,
} from '@/src/shared/forecourt/runtimeConfigShared'
import { kvGetMany } from '@/src/shared/storage/stationKv'
import { logger } from '@/src/shared/utils/logger'

export type ForecourtMode = 'jpl_tcp'

export type ForecourtRuntimeConfig = {
  mode: ForecourtMode
  jplOperationMode: 'unsupervised' | 'supervised'
  jplHost: string
  jplPort: number
  jplPosId: string
  jplAccessCode: string
  jplCountryCode: string
  jplPosVersionId: string
  jplUnsolicitedDrSeconds: number
  jplHeartbeatIntervalMs: number
  jplDeadConnectionTimeoutMs: number
  jplExpectedMinVersion: string
  jplUnsolicitedFlags: string[]
  jplUnsolicitedMfdrFlags: string[]
  jplStatusUpdateCode: number
  jplBootstrapSnapshotEnabled: boolean

  // Buffer health thresholds (minutes + depths)
  bufferWarnDepthSup: number
  bufferCritDepthSup: number
  bufferWarnAgeMinSup: number
  bufferCritAgeMinSup: number
  bufferWarnDepthUnsup: number
  bufferCritDepthUnsup: number
  bufferWarnAgeMinUnsup: number
  bufferCritAgeMinUnsup: number
}

declare global {
  // eslint-disable-next-line no-var
  var __forecourtRuntimeConfig: ForecourtRuntimeConfig | undefined
  // eslint-disable-next-line no-var
  var __forecourtRuntimeConfigLoadedAt: number | undefined
  // eslint-disable-next-line no-var
  var __forecourtRuntimeConfigListeners:
    | Set<(cfg: ForecourtRuntimeConfig) => void>
    | undefined
  // eslint-disable-next-line no-var
  var __forecourtRuntimeConfigWatchers:
    | Map<string, ReturnType<typeof setInterval>>
    | undefined
}

const resolveFromEnv = (): ForecourtRuntimeConfig => {
  const jplOperationMode = normalizeJplOperationMode(
    process.env.JPL_OPERATION_MODE,
  )

  const portRaw = process.env.JPL_TCP_PORT
  const port = portRaw ? Number(portRaw) : 8888
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid JPL_TCP_PORT="${portRaw}"`)
  }

  const jplHost = String(process.env.JPL_TCP_HOST || '127.0.0.1')
  const jplPort = port
  const jplPosId = String(process.env.JPL_POS_ID || '01')
  const jplAccessCode = String(process.env.JPL_FC_ACCESS_CODE || 'POS')
  const jplCountryCode = String(process.env.JPL_COUNTRY_CODE || '1')
  const jplPosVersionId = String(
    process.env.JPL_POS_VERSION_ID || '470-02-1.08',
  )
  const jplUnsolicitedDrSeconds = toInt(
    process.env.JPL_UNSOLICITED_DR_SECONDS,
    5,
  )
  const jplHeartbeatIntervalMs = toInt(
    process.env.JPL_HEARTBEAT_INTERVAL_MS,
    15_000,
  )
  const jplDeadConnectionTimeoutMs = toInt(
    process.env.JPL_DEAD_CONNECTION_TIMEOUT_MS,
    30_000,
  )
  const jplExpectedMinVersion = String(
    process.env.JPL_EXPECTED_MIN_VERSION || '470-02-1.07',
  )
  const jplUnsolicitedFlags = parseCsvStringList(
    process.env.JPL_UNSOLICITED_FLAGS ||
      'UNSO_TRBUFSTA_3,UNSO_TGSTA_1,UNSO_DELIVSTA_1',
  )
  const jplUnsolicitedMfdrFlags = parseCsvStringList(
    process.env.JPL_UNSOLICITED_MFDR_FLAGS || 'UNSO_FPSTA_3',
  )
  const jplStatusUpdateCode = toInt(process.env.JPL_STATUS_UPDATE_CODE, 3)
  const jplBootstrapSnapshotEnabled = normalizeBooleanFlag(
    process.env.JPL_BOOTSTRAP_SNAPSHOT_ENABLED,
    true,
  )

  return {
    mode: 'jpl_tcp',
    jplOperationMode,
    jplHost,
    jplPort,
    jplPosId,
    jplAccessCode,
    jplCountryCode,
    jplPosVersionId,
    jplUnsolicitedDrSeconds,
    jplHeartbeatIntervalMs,
    jplDeadConnectionTimeoutMs,
    jplExpectedMinVersion,
    jplUnsolicitedFlags,
    jplUnsolicitedMfdrFlags,
    jplStatusUpdateCode,
    jplBootstrapSnapshotEnabled,
    bufferWarnDepthSup: toInt(process.env.BUFFER_WARN_DEPTH_SUP, 2),
    bufferCritDepthSup: toInt(process.env.BUFFER_CRIT_DEPTH_SUP, 5),
    bufferWarnAgeMinSup: toInt(process.env.BUFFER_WARN_AGE_MIN_SUP, 5),
    bufferCritAgeMinSup: toInt(process.env.BUFFER_CRIT_AGE_MIN_SUP, 15),
    bufferWarnDepthUnsup: toInt(process.env.BUFFER_WARN_DEPTH_UNSUP, 1),
    bufferCritDepthUnsup: toInt(process.env.BUFFER_CRIT_DEPTH_UNSUP, 3),
    bufferWarnAgeMinUnsup: toInt(process.env.BUFFER_WARN_AGE_MIN_UNSUP, 2),
    bufferCritAgeMinUnsup: toInt(process.env.BUFFER_CRIT_AGE_MIN_UNSUP, 10),
  }
}

const setRuntimeConfig = (cfg: ForecourtRuntimeConfig) => {
  globalThis.__forecourtRuntimeConfig = cfg
  globalThis.__forecourtRuntimeConfigLoadedAt = Date.now()

  const listeners = globalThis.__forecourtRuntimeConfigListeners
  if (!listeners) return

  for (const listener of listeners) {
    try {
      listener(cfg)
    } catch (err) {
      logger.error('[forecourt-config]', {
        msg: 'listener error',
        error: err,
      })
    }
  }
}

const isSameConfig = (
  a: ForecourtRuntimeConfig | undefined,
  b: ForecourtRuntimeConfig,
) => {
  if (!a) return false
  return (
    a.mode === b.mode &&
    a.jplOperationMode === b.jplOperationMode &&
    a.jplHost === b.jplHost &&
    a.jplPort === b.jplPort &&
    a.jplPosId === b.jplPosId &&
    a.jplAccessCode === b.jplAccessCode &&
    a.jplCountryCode === b.jplCountryCode &&
    a.jplPosVersionId === b.jplPosVersionId &&
    a.jplUnsolicitedDrSeconds === b.jplUnsolicitedDrSeconds &&
    a.jplHeartbeatIntervalMs === b.jplHeartbeatIntervalMs &&
    a.jplDeadConnectionTimeoutMs === b.jplDeadConnectionTimeoutMs &&
    a.jplExpectedMinVersion === b.jplExpectedMinVersion &&
    JSON.stringify(a.jplUnsolicitedFlags) ===
      JSON.stringify(b.jplUnsolicitedFlags) &&
    JSON.stringify(a.jplUnsolicitedMfdrFlags) ===
      JSON.stringify(b.jplUnsolicitedMfdrFlags) &&
    a.jplStatusUpdateCode === b.jplStatusUpdateCode &&
    a.jplBootstrapSnapshotEnabled === b.jplBootstrapSnapshotEnabled &&
    a.bufferWarnDepthSup === b.bufferWarnDepthSup &&
    a.bufferCritDepthSup === b.bufferCritDepthSup &&
    a.bufferWarnAgeMinSup === b.bufferWarnAgeMinSup &&
    a.bufferCritAgeMinSup === b.bufferCritAgeMinSup &&
    a.bufferWarnDepthUnsup === b.bufferWarnDepthUnsup &&
    a.bufferCritDepthUnsup === b.bufferCritDepthUnsup &&
    a.bufferWarnAgeMinUnsup === b.bufferWarnAgeMinUnsup &&
    a.bufferCritAgeMinUnsup === b.bufferCritAgeMinUnsup
  )
}

export const getForecourtRuntimeConfig = (): ForecourtRuntimeConfig => {
  if (globalThis.__forecourtRuntimeConfig) {
    return globalThis.__forecourtRuntimeConfig
  }

  const cfg = resolveFromEnv()
  setRuntimeConfig(cfg)
  return cfg
}

export const loadForecourtRuntimeConfigFromDb = async (stationId: string) => {
  const previous = globalThis.__forecourtRuntimeConfig
  const base = resolveFromEnv()

  const keys = [
    KEY.JPL_OPERATION_MODE,
    KEY.JPL_HOST,
    KEY.JPL_PORT,
    KEY.JPL_POS_ID,
    KEY.JPL_FC_ACCESS_CODE,
    KEY.JPL_COUNTRY_CODE,
    KEY.JPL_POS_VERSION_ID,
    KEY.JPL_UNSOLICITED_DR_SECONDS,
    KEY.JPL_HEARTBEAT_INTERVAL_MS,
    KEY.JPL_DEAD_CONNECTION_TIMEOUT_MS,
    KEY.JPL_EXPECTED_MIN_VERSION,
    KEY.JPL_UNSOLICITED_FLAGS,
    KEY.JPL_UNSOLICITED_MFDR_FLAGS,
    KEY.JPL_STATUS_UPDATE_CODE,
    KEY.JPL_BOOTSTRAP_SNAPSHOT_ENABLED,
    KEY.BUFFER_WARN_DEPTH_SUP,
    KEY.BUFFER_CRIT_DEPTH_SUP,
    KEY.BUFFER_WARN_AGE_MIN_SUP,
    KEY.BUFFER_CRIT_AGE_MIN_SUP,
    KEY.BUFFER_WARN_DEPTH_UNSUP,
    KEY.BUFFER_CRIT_DEPTH_UNSUP,
    KEY.BUFFER_WARN_AGE_MIN_UNSUP,
    KEY.BUFFER_CRIT_AGE_MIN_UNSUP,
  ] as const
  const values = await kvGetMany<any>(stationId, [...keys])
  const [
    jplOperationMode,
    jplHost,
    jplPort,
    jplPosId,
    jplAccessCode,
    jplCountryCode,
    jplPosVersionId,
    jplUnsolicitedDrSeconds,
    jplHeartbeatIntervalMs,
    jplDeadConnectionTimeoutMs,
    jplExpectedMinVersion,
    jplUnsolicitedFlags,
    jplUnsolicitedMfdrFlags,
    jplStatusUpdateCode,
    jplBootstrapSnapshotEnabled,
    bufferWarnDepthSup,
    bufferCritDepthSup,
    bufferWarnAgeMinSup,
    bufferCritAgeMinSup,
    bufferWarnDepthUnsup,
    bufferCritDepthUnsup,
    bufferWarnAgeMinUnsup,
    bufferCritAgeMinUnsup,
  ] = keys.map((key) => values[key])

  const merged: ForecourtRuntimeConfig = {
    mode: 'jpl_tcp',
    jplOperationMode:
      jplOperationMode != null && String(jplOperationMode).trim().length
        ? normalizeJplOperationMode(jplOperationMode)
        : base.jplOperationMode,
    jplHost: normalizeForecourtHost(jplHost, base.jplHost),
    jplPort:
      jplPort != null
        ? normalizeForecourtPort(jplPort, base.jplPort)
        : base.jplPort,
    jplPosId:
      jplPosId != null && String(jplPosId).trim().length
        ? String(jplPosId).trim()
        : base.jplPosId,
    jplAccessCode:
      jplAccessCode != null && String(jplAccessCode).trim().length
        ? String(jplAccessCode).trim()
        : base.jplAccessCode,
    jplCountryCode:
      jplCountryCode != null && String(jplCountryCode).trim().length
        ? String(jplCountryCode).trim()
        : base.jplCountryCode,
    jplPosVersionId:
      jplPosVersionId != null && String(jplPosVersionId).trim().length
        ? String(jplPosVersionId).trim()
        : base.jplPosVersionId,
    jplUnsolicitedDrSeconds:
      jplUnsolicitedDrSeconds != null
        ? toInt(jplUnsolicitedDrSeconds, base.jplUnsolicitedDrSeconds)
        : base.jplUnsolicitedDrSeconds,
    jplHeartbeatIntervalMs:
      jplHeartbeatIntervalMs != null
        ? toInt(jplHeartbeatIntervalMs, base.jplHeartbeatIntervalMs)
        : base.jplHeartbeatIntervalMs,
    jplDeadConnectionTimeoutMs:
      jplDeadConnectionTimeoutMs != null
        ? toInt(jplDeadConnectionTimeoutMs, base.jplDeadConnectionTimeoutMs)
        : base.jplDeadConnectionTimeoutMs,
    jplExpectedMinVersion:
      jplExpectedMinVersion != null &&
      String(jplExpectedMinVersion).trim().length
        ? String(jplExpectedMinVersion).trim()
        : base.jplExpectedMinVersion,
    jplUnsolicitedFlags:
      jplUnsolicitedFlags != null
        ? parseCsvStringList(jplUnsolicitedFlags)
        : base.jplUnsolicitedFlags,
    jplUnsolicitedMfdrFlags:
      jplUnsolicitedMfdrFlags != null
        ? parseCsvStringList(jplUnsolicitedMfdrFlags)
        : base.jplUnsolicitedMfdrFlags,
    jplStatusUpdateCode:
      jplStatusUpdateCode != null
        ? toInt(jplStatusUpdateCode, base.jplStatusUpdateCode)
        : base.jplStatusUpdateCode,
    jplBootstrapSnapshotEnabled:
      jplBootstrapSnapshotEnabled != null
        ? normalizeBooleanFlag(
            jplBootstrapSnapshotEnabled,
            base.jplBootstrapSnapshotEnabled,
          )
        : base.jplBootstrapSnapshotEnabled,
    bufferWarnDepthSup:
      bufferWarnDepthSup != null
        ? toInt(bufferWarnDepthSup, base.bufferWarnDepthSup)
        : base.bufferWarnDepthSup,
    bufferCritDepthSup:
      bufferCritDepthSup != null
        ? toInt(bufferCritDepthSup, base.bufferCritDepthSup)
        : base.bufferCritDepthSup,
    bufferWarnAgeMinSup:
      bufferWarnAgeMinSup != null
        ? toInt(bufferWarnAgeMinSup, base.bufferWarnAgeMinSup)
        : base.bufferWarnAgeMinSup,
    bufferCritAgeMinSup:
      bufferCritAgeMinSup != null
        ? toInt(bufferCritAgeMinSup, base.bufferCritAgeMinSup)
        : base.bufferCritAgeMinSup,
    bufferWarnDepthUnsup:
      bufferWarnDepthUnsup != null
        ? toInt(bufferWarnDepthUnsup, base.bufferWarnDepthUnsup)
        : base.bufferWarnDepthUnsup,
    bufferCritDepthUnsup:
      bufferCritDepthUnsup != null
        ? toInt(bufferCritDepthUnsup, base.bufferCritDepthUnsup)
        : base.bufferCritDepthUnsup,
    bufferWarnAgeMinUnsup:
      bufferWarnAgeMinUnsup != null
        ? toInt(bufferWarnAgeMinUnsup, base.bufferWarnAgeMinUnsup)
        : base.bufferWarnAgeMinUnsup,
    bufferCritAgeMinUnsup:
      bufferCritAgeMinUnsup != null
        ? toInt(bufferCritAgeMinUnsup, base.bufferCritAgeMinUnsup)
        : base.bufferCritAgeMinUnsup,
  }

  if (!isSameConfig(previous, merged)) {
    setRuntimeConfig(merged)
  }

  return merged
}

export const subscribeForecourtRuntimeConfig = (
  listener: (cfg: ForecourtRuntimeConfig) => void,
): (() => void) => {
  if (!globalThis.__forecourtRuntimeConfigListeners) {
    globalThis.__forecourtRuntimeConfigListeners = new Set()
  }
  globalThis.__forecourtRuntimeConfigListeners.add(listener)

  return () => {
    globalThis.__forecourtRuntimeConfigListeners?.delete(listener)
  }
}

export const setForecourtRuntimeConfig = (cfg: ForecourtRuntimeConfig) => {
  setRuntimeConfig(cfg)
}

export const startForecourtRuntimeConfigWatcher = (
  stationId: string,
  opts?: { pollMs?: number },
) => {
  const pollMs = Math.max(5_000, opts?.pollMs ?? 10_000)

  if (!globalThis.__forecourtRuntimeConfigWatchers) {
    globalThis.__forecourtRuntimeConfigWatchers = new Map()
  }

  const existing = globalThis.__forecourtRuntimeConfigWatchers.get(stationId)
  if (existing) {
    return () => {
      clearInterval(existing)
      globalThis.__forecourtRuntimeConfigWatchers?.delete(stationId)
    }
  }

  const timer = setInterval(() => {
    void loadForecourtRuntimeConfigFromDb(stationId).catch((err) => {
      logger.error('[forecourt-config]', {
        msg: 'watcher reload failed',
        error: err,
      })
    })
  }, pollMs)

  globalThis.__forecourtRuntimeConfigWatchers.set(stationId, timer)

  return () => {
    clearInterval(timer)
    globalThis.__forecourtRuntimeConfigWatchers?.delete(stationId)
  }
}
