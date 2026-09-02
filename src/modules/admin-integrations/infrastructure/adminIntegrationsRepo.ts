import {
  configJsonEquals,
  hashConfigJson,
} from '@/src/platform/config/config-version-policy'
import { query, queryOne } from '@/src/platform/db/postgres'
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
    const current = await queryOne<{
      schema_version: string
      config_json: Record<string, unknown>
    }>(
      `SELECT schema_version, config_json
         FROM station_config
        WHERE station_id = $1`,
      [opts.stationId],
    )
    if (current && configJsonEquals(current.config_json, opts.nextConfigJson)) {
      return
    }

    if (current) {
      const id = uuidv4()
      const configHash = hashConfigJson(current.config_json)
      await query(
        `INSERT INTO station_config_versions
           (id, station_id, schema_version, config_json, config_hash, created_by)
         SELECT $1, $2, $3, $4, $5, $6
          WHERE NOT EXISTS (
            SELECT 1
              FROM (
                SELECT config_hash, config_json
                  FROM station_config_versions
                 WHERE station_id = $2
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
              ) latest
             WHERE latest.config_hash = $5
                OR (latest.config_hash IS NULL AND latest.config_json = $4::jsonb)
          )`,
        [
          id,
          opts.stationId,
          current.schema_version,
          current.config_json,
          configHash,
          opts.username,
        ],
      )
    }

    await query(
      `UPDATE station_config
          SET config_json = $2,
              updated_at = NOW()
        WHERE station_id = $1`,
      [opts.stationId, opts.nextConfigJson],
    )
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey])
  }
}
