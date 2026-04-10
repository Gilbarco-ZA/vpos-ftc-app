import {
  normalizeForecourtHost,
  normalizeForecourtPort,
} from '@/src/shared/forecourt/runtimeConfigShared'
import { kvGet } from '@/src/shared/storage/stationKv'

export const LEGACY_FORECOURT_RUNTIME_KV_KEYS = {
  SIM_HOST: 'env:FORECOURT_TCP_HOST',
  SIM_PORT: 'env:FORECOURT_TCP_PORT',
} as const

export type LegacyForecourtMode = 'sim_tcp' | null

export const getLegacyForecourtMode = (): LegacyForecourtMode => {
  const raw = String(
    process.env.FORECOURT_MODE ?? process.env.LEGACY_FORECOURT_MODE ?? '',
  )
    .trim()
    .toLowerCase()

  if (raw === 'sim_tcp' || raw === 'sim' || raw === 'simulator') {
    return 'sim_tcp'
  }

  return null
}

export type LegacyForecourtNetworkConfig = {
  simHost: string
  simPort: number
}

export const getLegacyForecourtNetworkConfig =
  (): LegacyForecourtNetworkConfig => ({
    simHost: normalizeForecourtHost(
      process.env.FORECOURT_TCP_HOST,
      '127.0.0.1',
    ),
    simPort: normalizeForecourtPort(process.env.FORECOURT_TCP_PORT, 10000),
  })

export const loadLegacyForecourtNetworkConfigFromDb = async (
  stationId: string,
): Promise<LegacyForecourtNetworkConfig> => {
  const base = getLegacyForecourtNetworkConfig()
  const [simHost, simPort] = await Promise.all([
    kvGet<any>(stationId, LEGACY_FORECOURT_RUNTIME_KV_KEYS.SIM_HOST),
    kvGet<any>(stationId, LEGACY_FORECOURT_RUNTIME_KV_KEYS.SIM_PORT),
  ])

  return {
    simHost: normalizeForecourtHost(simHost, base.simHost),
    simPort:
      simPort != null
        ? normalizeForecourtPort(simPort, base.simPort)
        : base.simPort,
  }
}
