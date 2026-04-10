import { query } from '@/src/platform/db/postgres'
import { getStationConfig } from '@/src/shared/config/loader'
import { uuidv4 } from '@/src/shared/utils/uuid'

export async function getStationConfigJsonRepo(stationId: string) {
  const row = await getStationConfig(stationId)
  return {
    row,
    configJson: ((row as any)?.configJson ??
      (row as any)?.config_json ??
      null) as Record<string, any> | null,
  }
}

export async function updateStationConfigJsonRepo(opts: {
  stationId: string
  username: string
  nextConfigJson: Record<string, any>
}) {
  const lockKey = `station_config_update:${opts.stationId}`
  await query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey])
  try {
    const id = uuidv4()
    await query(
      `
      INSERT INTO station_config_versions (id, station_id, schema_version, config_json, created_by)
      SELECT $3, station_id, schema_version, config_json, $2
      FROM station_config
      WHERE station_id = $1
      `,
      [opts.stationId, opts.username, id],
    )

    await query(
      `
      UPDATE station_config
      SET config_json = $2,
          updated_at = NOW()
      WHERE station_id = $1
      `,
      [opts.stationId, opts.nextConfigJson],
    )
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey])
  }
}
