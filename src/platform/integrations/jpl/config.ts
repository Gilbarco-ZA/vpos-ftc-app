import type { JplConfig } from '@/src/platform/integrations/jpl/types'

import { getSystemConfiguration } from '@/src/platform/config/loader'
import { getForecourtSettings } from '@/src/shared/forecourt/settings'

import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

/**
 * JPL integration config.
 *
 * Expected config_json:
 * {
 *   "integrations": {
 *     "jpl": {
 *       "host": "127.0.0.1",
 *       "appId": "POS",
 *       "countryCode": "1",
 *       "enabledApcs": ["apc1","apc2"],
 *       "timeoutMs": 10000,
 *       "posId": 1,
 *       "fpOperationModeNo": 1,
 *       "portOverrides": { "apc1": 8888, "apc2": 8889 }
 *     }
 *   }
 * }
 */
export async function getJplConfig(
  stationId: string,
): Promise<JplConfig | null> {
  const [cfg, forecourtSettings] = await Promise.all([
    getSystemConfiguration(stationId),
    getForecourtSettings(stationId),
  ])
  const integrations = (cfg as any)?.integrations ?? {}
  const jpl = integrations?.jpl
  const forecourtBase = getForecourtRuntimeConfig()

  const hasExplicitForecourtHost =
    String(forecourtSettings?.jplHost ?? '').trim().length > 0 &&
    String(forecourtSettings?.jplHost ?? '').trim() !==
      String(forecourtBase.jplHost ?? '').trim()
  const hasExplicitForecourtPort =
    Number(forecourtSettings?.jplPort) !== Number(forecourtBase.jplPort)
  const hasExplicitForecourtAccessCode =
    String(forecourtSettings?.jplAccessCode ?? '').trim().length > 0 &&
    String(forecourtSettings?.jplAccessCode ?? '').trim() !==
      String(forecourtBase.jplAccessCode ?? '').trim()
  const hasExplicitForecourtCountryCode =
    String(forecourtSettings?.jplCountryCode ?? '').trim().length > 0 &&
    String(forecourtSettings?.jplCountryCode ?? '').trim() !==
      String(forecourtBase.jplCountryCode ?? '').trim()
  const hasExplicitForecourtPosId =
    String(forecourtSettings?.jplPosId ?? '').trim().length > 0 &&
    String(forecourtSettings?.jplPosId ?? '').trim() !==
      String(forecourtBase.jplPosId ?? '').trim()

  const host = String(
    hasExplicitForecourtHost
      ? forecourtSettings.jplHost
      : (jpl?.host ?? forecourtSettings?.jplHost ?? ''),
  ).trim()
  if (!host) return null

  const portOverrides = {
    apc1:
      hasExplicitForecourtPort &&
      Number.isFinite(Number(forecourtSettings?.jplPort))
        ? Number(forecourtSettings?.jplPort)
        : jpl?.portOverrides?.apc1 != null
          ? Number(jpl.portOverrides.apc1)
          : undefined,
    apc2:
      jpl?.portOverrides?.apc2 != null
        ? Number(jpl.portOverrides.apc2)
        : undefined,
  }

  const appId = String(jpl?.appId ?? process.env.JPL_APP_ID ?? 'POS').trim()
  const accessCode = String(
    hasExplicitForecourtAccessCode
      ? forecourtSettings.jplAccessCode
      : (jpl?.accessCode ??
          jpl?.jplAccessCode ??
          forecourtSettings?.jplAccessCode ??
          process.env.JPL_FC_ACCESS_CODE ??
          'POS'),
  ).trim()
  const countryCode = String(
    hasExplicitForecourtCountryCode
      ? forecourtSettings.jplCountryCode
      : (jpl?.countryCode ??
          forecourtSettings?.jplCountryCode ??
          process.env.JPL_COUNTRY_CODE ??
          '1'),
  ).trim()

  const enabledApcs = Array.isArray(jpl?.enabledApcs)
    ? (jpl.enabledApcs as any[])
        .map((x) => String(x).trim().toLowerCase())
        .filter((x) => x === 'apc1' || x === 'apc2')
    : undefined

  const posId = hasExplicitForecourtPosId
    ? Number(forecourtSettings.jplPosId)
    : jpl?.posId != null
      ? Number(jpl.posId)
      : Number(process.env.JPL_POS_ID)
  const fpOperationModeNo =
    jpl?.fpOperationModeNo != null
      ? Number(jpl.fpOperationModeNo)
      : Number(process.env.JPL_FP_OPERATION_MODE_NO)

  return {
    host,
    appId,
    accessCode,
    countryCode,
    enabledApcs,
    portOverrides,
    posId: Number.isFinite(posId) ? posId : 1,
    fpOperationModeNo: Number.isFinite(fpOperationModeNo)
      ? fpOperationModeNo
      : 1,
    timeoutMs: Number(jpl?.timeoutMs ?? process.env.JPL_TIMEOUT_MS ?? 10_000),
  }
}
