import { jplSendPosCommand } from '@/src/platform/integrations/jpl/client'

import { syncTankGaugeVolumes } from '@/src/modules/forecourt/application/tankGauge'

export async function captureAtgSnapshot(stationId: string) {
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
