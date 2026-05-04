import { NextResponse } from "next/server";

import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { KV_KEYS, storeStationKv } from '@/src/shared/setup/api'
import { syncForecourtFromPumpsConfig } from '@/src/shared/setup/forecourtSync'

import type { PumpsConfig } from './pumpsConfigTypes'

function validatePumpsConfig(body: PumpsConfig | null | undefined) {
  if (!body || !Array.isArray(body.pumps) || body.pumps.length === 0) {
    return 'pumps[] is required'
  }

  for (const p of body.pumps) {
    if (!p?.pumpId) {
      return 'pumpId is required for each pump'
    }
    if (!Array.isArray(p.nozzles) || p.nozzles.length === 0) {
      return `nozzles[] is required for pump ${p.pumpId}`
    }
    for (const n of p.nozzles) {
      if (!n?.nozzleId || !n?.tankId) {
        return `nozzleId and tankId are required for pump ${p.pumpId}`
      }
    }
  }

  return null
}

export async function saveAdminPumpsConfig(
  stationId: string,
  body: PumpsConfig | null | undefined,
) {
  const validationError = validatePumpsConfig(body)
  if (validationError) {
    return NextResponse.json(
      { success: false, error: validationError },
      { status: 400 },
    )
  }

  await syncForecourtFromPumpsConfig(stationId, body as PumpsConfig)

  await Promise.all([
    storeStationKv(stationId, KV_KEYS.SETUP_STEP, 'pumps'),
    storeStationKv(
      stationId,
      KV_KEYS.SETUP_UPDATED_AT,
      new Date().toISOString(),
    ),
  ])

  try {
    await storeStationKv(
      stationId,
      PSS_XML_KEYS.EXPORT_REQUEST_AT,
      new Date().toISOString(),
    )
  } catch {}

  return NextResponse.json({ success: true, data: body })
}
