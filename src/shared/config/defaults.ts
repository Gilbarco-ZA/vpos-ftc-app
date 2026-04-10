import type { JsonObject } from '@/src/shared/config/types'

import { queryAll, queryOne, toCamelCase } from '@/src/platform/db/postgres'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'
import { safeAsync } from '@/src/shared/utils/safeAsync'

export type StationConfigDefaultsRow = {
  id: string
  country: string
  schemaVersion: string
  configJson: JsonObject
  createdAt: string
  updatedAt: string
}

type StationConfigDefaultsDbRow = {
  id: string
  country: string
  schema_version: string
  config_json: JsonObject
  created_at: string
  updated_at: string
}

const DEFAULTS_SELECT_SQL = `SELECT id, country, schema_version, config_json, created_at, updated_at
       FROM station_config_defaults`

export async function getStationConfigDefaults(
  country: string,
  schemaVersion: string,
): Promise<StationConfigDefaultsRow | null> {
  const row = await safeAsync(
    queryOne<StationConfigDefaultsDbRow>(
      `${DEFAULTS_SELECT_SQL}
       WHERE country = $1 AND schema_version = $2`,
      [
        requireNonEmptyString(country, 'country').trim().toUpperCase(),
        requireNonEmptyString(schemaVersion, 'schemaVersion'),
      ],
    ),
    'defaults.getStationConfigDefaults',
  )

  if (!row) return null
  return toCamelCase<StationConfigDefaultsRow>(row as any)
}

export async function listStationConfigDefaults(): Promise<
  StationConfigDefaultsRow[]
> {
  const rows =
    (await safeAsync(
      queryAll<StationConfigDefaultsDbRow>(
        `${DEFAULTS_SELECT_SQL}
      ORDER BY country ASC, schema_version ASC`,
        [],
      ),
      'defaults.listStationConfigDefaults',
    )) ?? []

  return rows.map((row) => toCamelCase<StationConfigDefaultsRow>(row as any))
}
