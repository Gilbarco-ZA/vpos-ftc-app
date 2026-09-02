import {
  defaultTankConfig,
  normalizeTankConfig,
} from '@/src/shared/settings/tanksConfig'

import { captureAtgSnapshot } from '@/src/modules/forecourt/application/captureAtgSnapshot'
import {
  getTankConfigRepo,
  saveTankConfigRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

type SyncTankVolumesDeps = {
  captureAtgSnapshot?: typeof captureAtgSnapshot
  getTankConfig?: typeof getTankConfigRepo
  saveTankConfig?: typeof saveTankConfigRepo
}

const tankIndexFromGaugeId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null
}

export async function syncTankVolumes(
  stationId: string,
  dependencyOverrides: SyncTankVolumesDeps = {},
) {
  if (!stationId) {
    return {
      capture: { recordedAt: '', requestedTgIds: [], snapshotsSaved: 0 },
      synced: { count: 0, requested: 0, controllerErrors: [] },
      tanks: [],
      config: defaultTankConfig,
      liveData: {
        requestedTgIds: [],
        responses: [],
        normalized: [],
        errors: [],
      },
    }
  }

  const capture = dependencyOverrides.captureAtgSnapshot ?? captureAtgSnapshot
  const getTankConfig = dependencyOverrides.getTankConfig ?? getTankConfigRepo
  const saveTankConfig =
    dependencyOverrides.saveTankConfig ?? saveTankConfigRepo
  const result = await capture(stationId)

  const existing = normalizeTankConfig(
    (await getTankConfig(stationId)) ?? defaultTankConfig,
  )
  const tankLevels = [...(existing.tankLevels ?? [])]
  let tankLevelUpdates = 0

  for (const tank of Array.isArray(result.tanks) ? result.tanks : []) {
    const index = tankIndexFromGaugeId(tank.tgId)
    const gross =
      tank.gross === null || tank.gross === undefined
        ? null
        : Number(tank.gross)
    if (
      index === null ||
      index >= existing.tanks.length ||
      gross === null ||
      !Number.isFinite(gross)
    ) {
      continue
    }
    if (tankLevels[index] !== gross) {
      tankLevels[index] = gross
      tankLevelUpdates += 1
    }
  }

  const config = normalizeTankConfig({ ...existing, tankLevels })
  if (tankLevelUpdates > 0) {
    await saveTankConfig(stationId, config)
  }

  return {
    capture: {
      recordedAt: result.recordedAt,
      requestedTgIds: Array.isArray(result.requestedTgIds)
        ? result.requestedTgIds
        : [],
      snapshotsSaved: Number(result.snapshotsSaved ?? 0),
    },
    synced: {
      count: Number(result.updated ?? 0),
      requested: Array.isArray(result.requestedTgIds)
        ? result.requestedTgIds.length
        : 0,
      controllerErrors: Array.isArray(result.controllerErrors)
        ? result.controllerErrors
        : [],
      tankLevelUpdates,
    },
    tanks: Array.isArray(result.tanks) ? result.tanks : [],
    config,
    liveData: result.liveData ?? {
      requestedTgIds: result.requestedTgIds ?? [],
      responses: [],
      normalized: [],
      errors: result.controllerErrors ?? [],
    },
  }
}
