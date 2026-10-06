import { jplSendPosCommand } from '@/src/platform/integrations/jpl/client'

import { syncTankGaugeVolumes } from '@/src/modules/forecourt/application/tankGauge'


export type AtgPublicationReading = {
  tgId: string
  domsTankId: string | null
  temperatureC: number | null
  tcVolumeLitres: number | null
  volumeLitres: number | null
  shellCapacityLitres: number | null
  maxSafeFillCapacityLitres: number | null
  gaugeOnline: boolean
  inventoryDataReady: boolean
  gaugeAlarmActive: boolean
  gaugeErrorActive: boolean
  controllerUpdatedAt: string | null
}

export type AtgSnapshotCaptureResult = {
  ok: boolean
  recordedAt: string
  requestedTgIds: string[]
  controllerErrors: unknown[]
  updated: number
  snapshotsSaved: number
  tanks: Array<{
    tankId: string
    tgId: string
    gross: number | null
    water: number | null
    updatedAt: string | null
  }>
  publicationReadings?: AtgPublicationReading[]
  liveData: {
    requestedTgIds: string[]
    responses: unknown[]
    normalized: unknown[]
    errors: unknown[]
  }
}

export async function captureAtgSnapshot(
  stationId: string,
): Promise<AtgSnapshotCaptureResult> {
  const result = await jplSendPosCommand(
    stationId,
    {
      type: 'GET_ALL_TG_DATA',
      payload: { stationId, includeStatusSnapshot: false },
    },
    { accessMode: 'forecourt' },
  )

  if (!result.ok) {
    throw new Error(result.error || result.message || 'GET_ALL_TG_DATA failed')
  }

  const normalized = Array.isArray(result.data?.normalized)
    ? result.data.normalized
    : []
  const responses = Array.isArray(result.data?.responses)
    ? result.data.responses
    : []
  const controllerErrors = Array.isArray(result.data?.errors)
    ? result.data.errors
    : []

  if (!normalized.length) {
    throw new Error('GET_ALL_TG_DATA returned no normalized tank readings')
  }

  const recordedAt = new Date().toISOString()
  const persisted = await syncTankGaugeVolumes(stationId, normalized, {
    recordedAt,
  })

  return {
    ok: true,
    recordedAt,
    requestedTgIds: Array.isArray(result.data?.requestedTgIds)
      ? result.data.requestedTgIds
      : [],
    controllerErrors,
    updated: persisted.updated,
    snapshotsSaved: persisted.snapshotsSaved,
    tanks: persisted.tanks,
    publicationReadings: normalized.map((reading: any) => ({
      tgId: reading.tgId,
      domsTankId: reading.tankId ?? null,
      temperatureC: reading.tankAverageTempC ?? null,
      tcVolumeLitres:
        reading.tankGrossStdVol ?? reading.tankAdjustedTCVolume ?? null,
      volumeLitres:
        reading.tankGrossObservedVol ??
        reading.tankTotalObservedVol ??
        reading.tankGrossStdVol ??
        null,
      shellCapacityLitres: reading.tankShellCapacity ?? null,
      maxSafeFillCapacityLitres: reading.tankMaxSafeFillCapacity ?? null,
      gaugeOnline: reading.gaugeOnline === true,
      inventoryDataReady: reading.inventoryDataReady === true,
      gaugeAlarmActive: reading.gaugeAlarmActive === true,
      gaugeErrorActive: reading.gaugeErrorActive === true,
      controllerUpdatedAt: reading.tankDataLastUpdateAt ?? null,
    })),
    liveData: {
      requestedTgIds: Array.isArray(result.data?.requestedTgIds)
        ? result.data.requestedTgIds
        : [],
      responses,
      normalized,
      errors: controllerErrors,
    },
  }
}
