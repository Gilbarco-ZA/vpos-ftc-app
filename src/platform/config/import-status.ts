import type { StationConfigDbRow } from '@/src/shared/config/types'

import { queryOne, toCamelCase } from '@/src/platform/db/postgres'

export type ConfigImportDbRow = {
  id: string
  station_id: string
  source_path: string
  source_checksum: string
  status: string
  message: string | null
  imported_at: string
}

const STATION_CONFIG_STATUS_SQL = `SELECT station_id, schema_version, config_json, created_at, updated_at
   FROM station_config
  WHERE station_id = $1`

const LAST_CONFIG_IMPORT_SQL = `SELECT id, station_id, source_path, source_checksum, status, message, imported_at
   FROM config_imports
  WHERE station_id = $1
  ORDER BY imported_at DESC
  LIMIT 1`

export async function getCurrentStationConfigStatus(stationId: string) {
  const configRow = await queryOne<StationConfigDbRow>(
    STATION_CONFIG_STATUS_SQL,
    [stationId],
  )
  const importRow = await queryOne<ConfigImportDbRow>(LAST_CONFIG_IMPORT_SQL, [
    stationId,
  ])

  return {
    config: configRow
      ? toCamelCase<Record<string, unknown>>(
          configRow as unknown as Record<string, unknown>,
        )
      : null,
    lastImport: importRow
      ? toCamelCase<Record<string, unknown>>(
          importRow as unknown as Record<string, unknown>,
        )
      : null,
  }
}
