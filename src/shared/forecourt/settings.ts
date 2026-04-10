import type {
  ForecourtMode,
  ForecourtRuntimeConfig,
} from '@/src/modules/forecourt/infrastructure/runtimeConfig'

import {
  getForecourtRuntimeConfig,
  loadForecourtRuntimeConfigFromDb,
} from '@/src/shared/forecourt/runtime'
import {
  FORECOURT_RUNTIME_KV_KEYS as KEY,
  normalizeBooleanFlag,
  normalizeForecourtHost,
  normalizeForecourtPort,
  normalizeJplOperationMode,
  parseCsvStringList,
} from '@/src/shared/forecourt/runtimeConfigShared'
import { kvGetMany, kvSet } from '@/src/shared/storage/stationKv'

import {
  buildJplAccessCode,
  normalizeJplPosId,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import { setForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export type SaveForecourtSettingsInput = Partial<{
  mode: ForecourtMode | string
  jplOperationMode: 'unsupervised' | 'supervised' | string
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
  jplUnsolicitedFlags: string[] | string
  jplUnsolicitedMfdrFlags: string[] | string
  jplStatusUpdateCode: number
  jplBootstrapSnapshotEnabled: boolean
  bufferWarnDepthSup: number
  bufferCritDepthSup: number
  bufferWarnAgeMinSup: number
  bufferCritAgeMinSup: number
  bufferWarnDepthUnsup: number
  bufferCritDepthUnsup: number
  bufferWarnAgeMinUnsup: number
  bufferCritAgeMinUnsup: number
}>

export async function getForecourtSettings(
  stationId: string,
): Promise<ForecourtRuntimeConfig> {
  const base = getForecourtRuntimeConfig()
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

  const effectiveDrSeconds =
    jplUnsolicitedDrSeconds != null
      ? Number(jplUnsolicitedDrSeconds)
      : base.jplUnsolicitedDrSeconds
  const effectiveFlags =
    jplUnsolicitedFlags != null
      ? parseCsvStringList(jplUnsolicitedFlags)
      : base.jplUnsolicitedFlags
  const effectiveMfdrFlags =
    jplUnsolicitedMfdrFlags != null
      ? parseCsvStringList(jplUnsolicitedMfdrFlags)
      : base.jplUnsolicitedMfdrFlags

  return {
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
    jplPosId: normalizeJplPosId(
      jplPosId != null ? jplPosId : base.jplPosId,
      String(base.jplPosId ?? '01'),
    ),
    jplAccessCode: buildJplAccessCode({
      baseAccessCode:
        jplAccessCode != null ? String(jplAccessCode) : base.jplAccessCode,
      drSeconds: effectiveDrSeconds,
      requiredFlags: effectiveFlags,
      mfdrFlags: effectiveMfdrFlags,
    }),
    jplCountryCode:
      jplCountryCode != null ? jplCountryCode : base.jplCountryCode,
    jplPosVersionId:
      jplPosVersionId != null ? jplPosVersionId : base.jplPosVersionId,
    jplUnsolicitedDrSeconds: effectiveDrSeconds,
    jplHeartbeatIntervalMs:
      jplHeartbeatIntervalMs != null
        ? Number(jplHeartbeatIntervalMs)
        : base.jplHeartbeatIntervalMs,
    jplDeadConnectionTimeoutMs:
      jplDeadConnectionTimeoutMs != null
        ? Number(jplDeadConnectionTimeoutMs)
        : base.jplDeadConnectionTimeoutMs,
    jplExpectedMinVersion:
      jplExpectedMinVersion != null
        ? String(jplExpectedMinVersion)
        : base.jplExpectedMinVersion,
    jplUnsolicitedFlags: effectiveFlags,
    jplUnsolicitedMfdrFlags: effectiveMfdrFlags,
    jplStatusUpdateCode:
      jplStatusUpdateCode != null
        ? Number(jplStatusUpdateCode)
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
        ? Number(bufferWarnDepthSup)
        : base.bufferWarnDepthSup,
    bufferCritDepthSup:
      bufferCritDepthSup != null
        ? Number(bufferCritDepthSup)
        : base.bufferCritDepthSup,
    bufferWarnAgeMinSup:
      bufferWarnAgeMinSup != null
        ? Number(bufferWarnAgeMinSup)
        : base.bufferWarnAgeMinSup,
    bufferCritAgeMinSup:
      bufferCritAgeMinSup != null
        ? Number(bufferCritAgeMinSup)
        : base.bufferCritAgeMinSup,
    bufferWarnDepthUnsup:
      bufferWarnDepthUnsup != null
        ? Number(bufferWarnDepthUnsup)
        : base.bufferWarnDepthUnsup,
    bufferCritDepthUnsup:
      bufferCritDepthUnsup != null
        ? Number(bufferCritDepthUnsup)
        : base.bufferCritDepthUnsup,
    bufferWarnAgeMinUnsup:
      bufferWarnAgeMinUnsup != null
        ? Number(bufferWarnAgeMinUnsup)
        : base.bufferWarnAgeMinUnsup,
    bufferCritAgeMinUnsup:
      bufferCritAgeMinUnsup != null
        ? Number(bufferCritAgeMinUnsup)
        : base.bufferCritAgeMinUnsup,
  }
}

export async function saveForecourtSettings(
  stationId: string,
  input: SaveForecourtSettingsInput,
): Promise<ForecourtRuntimeConfig> {
  const current = await getForecourtSettings(stationId)
  const nextFlags =
    input.jplUnsolicitedFlags != null
      ? parseCsvStringList(input.jplUnsolicitedFlags)
      : current.jplUnsolicitedFlags
  const nextMfdrFlags =
    input.jplUnsolicitedMfdrFlags != null
      ? parseCsvStringList(input.jplUnsolicitedMfdrFlags)
      : current.jplUnsolicitedMfdrFlags
  const nextDrSeconds =
    input.jplUnsolicitedDrSeconds != null
      ? Number(input.jplUnsolicitedDrSeconds)
      : current.jplUnsolicitedDrSeconds

  const next: ForecourtRuntimeConfig = {
    mode: 'jpl_tcp',
    jplOperationMode:
      input.jplOperationMode != null
        ? normalizeJplOperationMode(input.jplOperationMode)
        : current.jplOperationMode,
    jplHost: normalizeForecourtHost(input.jplHost, current.jplHost),
    jplPort:
      input.jplPort != null
        ? normalizeForecourtPort(input.jplPort, current.jplPort)
        : current.jplPort,
    jplPosId: normalizeJplPosId(
      input.jplPosId != null ? input.jplPosId : current.jplPosId,
      current.jplPosId,
    ),
    jplAccessCode: buildJplAccessCode({
      baseAccessCode:
        input.jplAccessCode != null
          ? input.jplAccessCode
          : current.jplAccessCode,
      drSeconds: nextDrSeconds,
      requiredFlags: nextFlags,
      mfdrFlags: nextMfdrFlags,
    }),
    jplCountryCode:
      input.jplCountryCode != null
        ? input.jplCountryCode
        : current.jplCountryCode,
    jplPosVersionId:
      input.jplPosVersionId != null
        ? input.jplPosVersionId
        : current.jplPosVersionId,
    jplUnsolicitedDrSeconds: nextDrSeconds,
    jplHeartbeatIntervalMs:
      input.jplHeartbeatIntervalMs != null
        ? Number(input.jplHeartbeatIntervalMs)
        : current.jplHeartbeatIntervalMs,
    jplDeadConnectionTimeoutMs:
      input.jplDeadConnectionTimeoutMs != null
        ? Number(input.jplDeadConnectionTimeoutMs)
        : current.jplDeadConnectionTimeoutMs,
    jplExpectedMinVersion:
      input.jplExpectedMinVersion != null
        ? String(input.jplExpectedMinVersion)
        : current.jplExpectedMinVersion,
    jplUnsolicitedFlags: nextFlags,
    jplUnsolicitedMfdrFlags: nextMfdrFlags,
    jplStatusUpdateCode:
      input.jplStatusUpdateCode != null
        ? Number(input.jplStatusUpdateCode)
        : current.jplStatusUpdateCode,
    jplBootstrapSnapshotEnabled:
      input.jplBootstrapSnapshotEnabled != null
        ? normalizeBooleanFlag(
            input.jplBootstrapSnapshotEnabled,
            current.jplBootstrapSnapshotEnabled,
          )
        : current.jplBootstrapSnapshotEnabled,
    bufferWarnDepthSup:
      input.bufferWarnDepthSup != null
        ? Number(input.bufferWarnDepthSup)
        : current.bufferWarnDepthSup,
    bufferCritDepthSup:
      input.bufferCritDepthSup != null
        ? Number(input.bufferCritDepthSup)
        : current.bufferCritDepthSup,
    bufferWarnAgeMinSup:
      input.bufferWarnAgeMinSup != null
        ? Number(input.bufferWarnAgeMinSup)
        : current.bufferWarnAgeMinSup,
    bufferCritAgeMinSup:
      input.bufferCritAgeMinSup != null
        ? Number(input.bufferCritAgeMinSup)
        : current.bufferCritAgeMinSup,
    bufferWarnDepthUnsup:
      input.bufferWarnDepthUnsup != null
        ? Number(input.bufferWarnDepthUnsup)
        : current.bufferWarnDepthUnsup,
    bufferCritDepthUnsup:
      input.bufferCritDepthUnsup != null
        ? Number(input.bufferCritDepthUnsup)
        : current.bufferCritDepthUnsup,
    bufferWarnAgeMinUnsup:
      input.bufferWarnAgeMinUnsup != null
        ? Number(input.bufferWarnAgeMinUnsup)
        : current.bufferWarnAgeMinUnsup,
    bufferCritAgeMinUnsup:
      input.bufferCritAgeMinUnsup != null
        ? Number(input.bufferCritAgeMinUnsup)
        : current.bufferCritAgeMinUnsup,
  }

  await Promise.all([
    kvSet(stationId, KEY.JPL_OPERATION_MODE, next.jplOperationMode),
    kvSet(stationId, KEY.JPL_HOST, next.jplHost),
    kvSet(stationId, KEY.JPL_PORT, String(next.jplPort)),
    kvSet(stationId, KEY.JPL_POS_ID, next.jplPosId),
    kvSet(stationId, KEY.JPL_FC_ACCESS_CODE, next.jplAccessCode),
    kvSet(stationId, KEY.JPL_COUNTRY_CODE, next.jplCountryCode),
    kvSet(stationId, KEY.JPL_POS_VERSION_ID, next.jplPosVersionId),
    kvSet(
      stationId,
      KEY.JPL_UNSOLICITED_DR_SECONDS,
      String(next.jplUnsolicitedDrSeconds),
    ),
    kvSet(
      stationId,
      KEY.JPL_HEARTBEAT_INTERVAL_MS,
      String(next.jplHeartbeatIntervalMs),
    ),
    kvSet(
      stationId,
      KEY.JPL_DEAD_CONNECTION_TIMEOUT_MS,
      String(next.jplDeadConnectionTimeoutMs),
    ),
    kvSet(
      stationId,
      KEY.JPL_EXPECTED_MIN_VERSION,
      String(next.jplExpectedMinVersion),
    ),
    kvSet(
      stationId,
      KEY.JPL_UNSOLICITED_FLAGS,
      next.jplUnsolicitedFlags.join(','),
    ),
    kvSet(
      stationId,
      KEY.JPL_UNSOLICITED_MFDR_FLAGS,
      next.jplUnsolicitedMfdrFlags.join(','),
    ),
    kvSet(
      stationId,
      KEY.JPL_STATUS_UPDATE_CODE,
      String(next.jplStatusUpdateCode),
    ),
    kvSet(
      stationId,
      KEY.JPL_BOOTSTRAP_SNAPSHOT_ENABLED,
      String(next.jplBootstrapSnapshotEnabled),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_WARN_DEPTH_SUP,
      String(next.bufferWarnDepthSup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_CRIT_DEPTH_SUP,
      String(next.bufferCritDepthSup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_WARN_AGE_MIN_SUP,
      String(next.bufferWarnAgeMinSup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_CRIT_AGE_MIN_SUP,
      String(next.bufferCritAgeMinSup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_WARN_DEPTH_UNSUP,
      String(next.bufferWarnDepthUnsup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_CRIT_DEPTH_UNSUP,
      String(next.bufferCritDepthUnsup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_WARN_AGE_MIN_UNSUP,
      String(next.bufferWarnAgeMinUnsup),
    ),
    kvSet(
      stationId,
      KEY.BUFFER_CRIT_AGE_MIN_UNSUP,
      String(next.bufferCritAgeMinUnsup),
    ),
  ])

  setForecourtRuntimeConfig(next)
  await loadForecourtRuntimeConfigFromDb(stationId).catch(() => {})
  return next
}
