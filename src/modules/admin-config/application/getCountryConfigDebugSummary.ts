import type { LegacyCountryConfigTable } from '@/src/shared/config/countryCatalogPolicy'

import { queryOne } from '@/src/platform/db/postgres'
import { LEGACY_COUNTRY_CONFIG_TABLES } from '@/src/shared/config/countryCatalogPolicy'
import { getCountryCatalogDiagnostics } from '@/src/shared/server/config/countryCatalog'

async function countLegacyTable(table: LegacyCountryConfigTable) {
  const exists = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass(current_schema() || '.' || $1) IS NOT NULL AS exists`,
    [table],
  )
  if (!exists?.exists) return { exists: false, count: 0 }
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(1)::text AS count FROM ${table}`,
  )
  return { exists: true, count: Number(row?.count || 0) }
}

export async function getCountryConfigDebugSummary(countryCode: string) {
  const canonical = await getCountryCatalogDiagnostics(countryCode)
  const legacyEntries = await Promise.all(
    (
      Object.keys(LEGACY_COUNTRY_CONFIG_TABLES) as LegacyCountryConfigTable[]
    ).map(async (table) => [table, await countLegacyTable(table)] as const),
  )
  return {
    source: 'country_dataset_rows',
    countryCode,
    canonical,
    legacy: Object.fromEntries(legacyEntries),
  }
}
