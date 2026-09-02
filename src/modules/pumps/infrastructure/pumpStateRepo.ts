import type { PumpStateSnapshot } from '@/src/modules/pumps/infrastructure/pumpStore'

import { readPumpSnapshot } from '@/src/shared/forecourt/sharedState'
import { getPumpsConfigFromDb } from '@/src/shared/setup/forecourtSync'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import {
  getPumpState,
  startPumpBusListener,
} from '@/src/modules/pumps/infrastructure/pumpStore'

export type PumpStatePayload = {
  config: any
  liveState: PumpStateSnapshot
}

export const hydrateLiveStateFromConfig = (
  stationId: string,
  config: any,
  liveState: PumpStateSnapshot,
): PumpStateSnapshot => {
  const configuredPumps = Array.isArray(config?.pumps) ? config.pumps : []
  if (!configuredPumps.length) return liveState
  if (Array.isArray(liveState?.pumps) && liveState.pumps.length > 0) {
    return liveState
  }

  const now = Date.now()

  return {
    stationId,
    updatedAt: now,
    pumps: configuredPumps.map((pump: any) => {
      const pumpId = String(pump?.pumpId ?? '').trim()
      const nozzles = Array.isArray(pump?.nozzles) ? pump.nozzles : []
      return {
        pumpId,
        updatedAt: now,
        lastSeenAt: null,
        health: 'offline' as const,
        nozzles: nozzles
          .map((nozzle: any) => {
            const nozzleId = String(nozzle?.nozzleId ?? '').trim()
            if (!nozzleId) return null
            return {
              nozzleId,
              fuelType:
                nozzle?.productName ?? nozzle?.productCode ?? nozzle?.fuelType,
              state: 'offline' as const,
              updatedAt: now,
            }
          })
          .filter(Boolean),
      }
    }),
  }
}

export async function loadPumpStatePayload(
  stationId: string,
): Promise<PumpStatePayload> {
  startPumpBusListener()

  const [dbConfig, kvConfig, liveState] = await Promise.all([
    safeAsync(getPumpsConfigFromDb(stationId), 'pumpsState.loadConfig'),
    kvGet<any>(stationId, KV_KEYS.PUMPS_CONFIG),
    readPumpSnapshot(stationId).then(
      (snapshot) => snapshot ?? getPumpState(stationId),
    ),
  ])

  const config =
    dbConfig && Array.isArray((dbConfig as any)?.pumps) && dbConfig.pumps.length
      ? dbConfig
      : kvConfig

  return {
    config,
    liveState: hydrateLiveStateFromConfig(stationId, config, liveState),
  }
}
