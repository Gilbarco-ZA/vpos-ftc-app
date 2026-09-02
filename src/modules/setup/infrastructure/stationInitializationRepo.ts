import { query, queryOne } from '@/src/platform/db/postgres'
import { kvSet } from '@/src/shared/storage/stationKv'
import { uuidv4 } from '@/src/shared/utils/uuid'

export async function ensureBootstrapStation(args: {
  runtimeStationId?: string
  name: string
  timezone: string
}) {
  const runtimeStationId = args.runtimeStationId?.trim() || null

  if (runtimeStationId) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id
       FROM fuel_stations
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [runtimeStationId],
    )

    if (!existing?.id) {
      await query(
        `INSERT INTO fuel_stations (id, name, timezone)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
         SET
           name = COALESCE(fuel_stations.name, EXCLUDED.name),
           timezone = COALESCE(fuel_stations.timezone, EXCLUDED.timezone),
           updated_at = NOW()`,
        [runtimeStationId, args.name, args.timezone],
      )
      return { stationId: runtimeStationId, didCreateStation: true }
    }

    return { stationId: runtimeStationId, didCreateStation: false }
  }

  const existingStation = await queryOne<{ id: string }>(
    `SELECT id
     FROM fuel_stations
     WHERE deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  )

  if (existingStation?.id) {
    return { stationId: existingStation.id, didCreateStation: false }
  }

  const stationId = uuidv4()
  await query(
    `INSERT INTO fuel_stations (id, name, timezone)
     VALUES ($1, $2, $3)`,
    [stationId, args.name, args.timezone],
  )

  return { stationId, didCreateStation: true }
}

export async function ensureBootstrapStationSettings(args: {
  stationId: string
  linkingWindowSeconds: number
}) {
  const id = uuidv4()

  await query(
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
     INSERT INTO station_settings (id, station_id, linking_window_seconds)
     SELECT $3, $1, $2
     WHERE NOT EXISTS (SELECT 1 FROM updated)`,
    [args.stationId, args.linkingWindowSeconds, id],
  )
}

export async function markBootstrapCompleted(stationId: string) {
  await kvSet(stationId, 'bootstrap.completed_at', new Date().toISOString())
}
