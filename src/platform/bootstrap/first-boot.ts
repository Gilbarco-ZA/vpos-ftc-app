import { importLegacyIfPresent } from '@/src/platform/bootstrap/legacy-importer'
import { ensurePostgresMigrations } from '@/src/platform/bootstrap/postgres-migrations'
import {
  getLegacyArchiveDir,
  getLegacyPermDir,
} from '@/src/platform/config/app-config'
import { bootstrapStationConfig } from '@/src/platform/config/loader'
import { getPool } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

let firstBootPromise: Promise<FirstBootResult> | null = null

export type FirstBootResult = {
  didCreateStation: boolean
  didCreateAdminUser: boolean
  didImportLegacy: boolean
  stationId: string | null
}

export const ensureFirstBoot = async (
  runtimeStationId?: string,
): Promise<FirstBootResult> => {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  if (isBuild) {
    return {
      didCreateStation: false,
      didCreateAdminUser: false,
      didImportLegacy: false,
      stationId: null,
    }
  }

  const enabled =
    String(process.env.RUN_BOOTSTRAP || 'true').toLowerCase() === 'true'
  if (!enabled) {
    return {
      didCreateStation: false,
      didCreateAdminUser: false,
      didImportLegacy: false,
      stationId: null,
    }
  }

  if (!firstBootPromise) firstBootPromise = runFirstBoot(runtimeStationId)
  return firstBootPromise
}

const runFirstBoot = async (
  runtimeStationId?: string,
): Promise<FirstBootResult> => {
  await ensurePostgresMigrations()

  const LOCK_KEY_1 = 514011
  const LOCK_KEY_2 = 992774

  let didCreateStation = false
  let didCreateAdminUser = false
  let didImportLegacy = false

  const pool = getPool()
  const client = await pool.connect()

  const name = (process.env.DEFAULT_STATION_NAME || 'Default Station').trim()
  const tz = (process.env.DEFAULT_STATION_TIMEZONE || 'Africa/Sao_Tome').trim()

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      LOCK_KEY_1,
      LOCK_KEY_2,
    ])

    let stationId: string | null = runtimeStationId?.trim() || null

    if (stationId) {
      const exists = await client.query(
        `SELECT 1
         FROM fuel_stations
         WHERE id = $1 AND deleted_at IS NULL
         LIMIT 1`,
        [stationId],
      )

      if (exists.rowCount === 0) {
        await client.query(
          `INSERT INTO fuel_stations (id, name, timezone)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE
           SET
             name = COALESCE(fuel_stations.name, EXCLUDED.name),
             timezone = COALESCE(fuel_stations.timezone, EXCLUDED.timezone),
             updated_at = NOW()`,
          [stationId, name, tz],
        )
        didCreateStation = true
      }
    } else {
      const existingStation = await client.query(
        `SELECT id
         FROM fuel_stations
         WHERE deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1`,
      )

      stationId = (existingStation.rows[0]?.id as string) || null

      if (!stationId) {
        const id = uuidv4()
        await client.query(
          `INSERT INTO fuel_stations (id, name, timezone)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [id, name, tz],
        )
        stationId = id
        didCreateStation = true
      }
    }

    if (stationId) {
      const linkingWindowSeconds = Number(
        process.env.DEFAULT_LINKING_WINDOW_SECONDS || 30,
      )
      const settingsKey = `default:${stationId}`
      const id = uuidv4()

      await client.query(
        `WITH target AS (
           SELECT id
           FROM station_settings
           WHERE station_id = $1
           ORDER BY created_at ASC
           LIMIT 1
         ),
         updated AS (
           UPDATE station_settings
           SET
             linking_window_seconds = COALESCE(linking_window_seconds, $2),
             updated_at = NOW()
           WHERE id IN (SELECT id FROM target)
           RETURNING id
         )
         INSERT INTO station_settings (id, station_id, linking_window_seconds, key)
         SELECT $3, $1, $2, $4
         WHERE NOT EXISTS (SELECT 1 FROM updated)`,
        [stationId, linkingWindowSeconds, id, settingsKey],
      )
    }

    didCreateAdminUser = false

    if (stationId) {
      const imported = await importLegacyIfPresent({
        stationId,
        legacyPermDir: getLegacyPermDir(),
        moveAsideRoot: getLegacyArchiveDir(),
      })
      didImportLegacy = Boolean(imported)

      if (didImportLegacy) {
        const { recomputeDailyTotalsRange } =
          await import('@/src/modules/transactions/infrastructure/dailyTotals')
        const to = new Date().toISOString().slice(0, 10)
        const fromDate = new Date()
        fromDate.setUTCDate(fromDate.getUTCDate() - 90)
        const from = fromDate.toISOString().slice(0, 10)
        await recomputeDailyTotalsRange(stationId, from, to)
      }
    }

    if (stationId) {
      try {
        await bootstrapStationConfig(stationId)
      } catch (err) {
        logger.error('[bootstrap]', {
          msg: 'Failed to bootstrap station_config',
          error: err,
        })
      }
    }

    if (stationId) {
      await client.query(
        `INSERT INTO station_kv (station_id, key, value)
         VALUES ($1, 'bootstrap.completed_at', to_jsonb(NOW()::timestamptz))
         ON CONFLICT (station_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [stationId],
      )
    }

    return {
      didCreateStation,
      didCreateAdminUser,
      didImportLegacy,
      stationId,
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        LOCK_KEY_1,
        LOCK_KEY_2,
      ])
    } catch {}
    client.release()
  }
}
