import { importLegacyIfPresent } from '@/src/platform/bootstrap/legacy-importer'
import { queryOne } from '@/src/platform/db/postgres'

import {
  recomputeDailyTotalsFromDbBounds,
  recomputeDailyTotalsRange,
} from './src/modules/transactions/infrastructure/dailyTotals'

let ran = false

async function getDefaultStationId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM fuel_stations WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1`,
  )
  return row?.id ?? null
}

export async function register() {
  if (ran) return
  ran = true

  const legacyPermDir =
    process.env.LEGACY_PERM_DIR || '/opt/fccapps/vpos-perm/vposfiscal'
  const stationId = process.env.STATION_ID || (await getDefaultStationId())
  if (!stationId) return

  const res = await importLegacyIfPresent({
    stationId,
    legacyPermDir,
    moveAsideRoot:
      process.env.LEGACY_IMPORT_DIR || '/opt/fccapps/vpos-perm/vposfiscal', // optional override
    sourceType: 'unknown',
  })
  if (res) {
    const to = new Date().toISOString().slice(0, 10)
    const fromDate = new Date()
    fromDate.setUTCDate(fromDate.getUTCDate() - 90)
    const from = fromDate.toISOString().slice(0, 10)

    await recomputeDailyTotalsRange(stationId, from, to)
  }
}
