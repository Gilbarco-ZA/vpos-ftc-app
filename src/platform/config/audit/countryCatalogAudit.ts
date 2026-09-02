import type { LegacyCountryConfigTable } from '@/src/shared/config/countryCatalogPolicy'
import type { DatasetType } from '@/src/shared/server/config/countryDatasets'

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import {
  COUNTRY_CATALOG_COMPATIBILITY_VIEWS,
  LEGACY_COUNTRY_CONFIG_TABLES,
  normalizeCountryCatalogCode,
} from '@/src/shared/config/countryCatalogPolicy'

export type CountryCatalogDependency = {
  objectType: string
  objectName: string
}

export type CountryCatalogLegacyTableAudit = {
  table: LegacyCountryConfigTable
  compatibilityView: string
  datasetType: DatasetType
  exists: boolean
  rowCount: number
  equivalentToCanonical: boolean
  missingCanonicalCodes: string[]
  differingCodes: string[]
  dependencies: CountryCatalogDependency[]
  safeToRetire: boolean
}

export type CountryCatalogAuditResult = {
  migrationApplied: boolean
  requestedCountryCode: string | null
  resolvedCountryCode: string | null
  stationCountries: Array<{ countryCode: string; stationCount: number }>
  countryResolutionAmbiguous: boolean
  canonical: {
    datasetActive: boolean
    contentHash: string | null
    hashReady: boolean
    rowCount: number
    rowsByDatasetType: Record<string, number>
    missingDatasetTypes: DatasetType[]
  }
  legacyTables: CountryCatalogLegacyTableAudit[]
  compatibilityViewsReady: boolean
  safeForDestructiveMigration: boolean
}

type ComparableRow = {
  code: string
  name: string
  description: string | null
  rate: number | null
  isActive: boolean
  sortOrder: number
}

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeComparableRow = (
  row: Record<string, unknown>,
): ComparableRow => {
  const rateValue = row.rate == null ? null : Number(row.rate)
  return {
    code: String(row.code ?? '').trim(),
    name: String(row.name ?? '').trim(),
    description:
      row.description == null ? null : String(row.description).trim() || null,
    rate: rateValue != null && Number.isFinite(rateValue) ? rateValue : null,
    isActive: Boolean(row.is_active ?? row.isActive),
    sortOrder: toNumber(row.sort_order ?? row.sortOrder),
  }
}

const rowsEquivalent = (
  left: ComparableRow,
  right: ComparableRow,
  includesRate: boolean,
) =>
  left.code === right.code &&
  left.name === right.name &&
  left.description === right.description &&
  left.isActive === right.isActive &&
  left.sortOrder === right.sortOrder &&
  (!includesRate || left.rate === right.rate)

const dependencySql = `
  WITH dependency_rows AS (
    SELECT 'view'::text AS object_type,
           schemaname || '.' || viewname AS object_name
      FROM pg_views
     WHERE definition ILIKE $1
    UNION ALL
    SELECT 'materialized_view'::text AS object_type,
           schemaname || '.' || matviewname AS object_name
      FROM pg_matviews
     WHERE definition ILIKE $1
    UNION ALL
    SELECT 'function'::text AS object_type,
           n.nspname || '.' || p.proname AS object_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind = 'f'
       AND pg_get_functiondef(p.oid) ILIKE $1
    UNION ALL
    SELECT 'trigger'::text AS object_type,
           n.nspname || '.' || c.relname || '.' || t.tgname AS object_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal
       AND pg_get_triggerdef(t.oid) ILIKE $1
  )
  SELECT DISTINCT object_type AS "objectType", object_name AS "objectName"
    FROM dependency_rows
   ORDER BY object_type, object_name
`

const listDependencies = async (
  table: LegacyCountryConfigTable,
): Promise<CountryCatalogDependency[]> =>
  await queryAll<CountryCatalogDependency>(dependencySql, [`%${table}%`])

const DATASET_TYPES = [
  'taxTypes',
  'productClassCodes',
  'productTypeCodes',
  'creditNoteReasons',
  'packagingUnits',
  'quantityUnits',
] as const satisfies readonly DatasetType[]

export const runCountryCatalogAudit = async (options?: {
  countryCode?: string | null
}): Promise<CountryCatalogAuditResult> => {
  const migration = await queryOne<{ applied: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM schema_migrations
        WHERE name = '1264_country_catalog_canonical.sql'
     ) AS applied`,
  )

  const stationCountryRows = await queryAll<{
    country_code: string
    station_count: string | number
  }>(
    `SELECT UPPER(BTRIM(country)) AS country_code,
            COUNT(*) AS station_count
       FROM fuel_stations
      WHERE deleted_at IS NULL
        AND NULLIF(BTRIM(country), '') IS NOT NULL
      GROUP BY UPPER(BTRIM(country))
      ORDER BY UPPER(BTRIM(country))`,
  )
  const stationCountries = stationCountryRows.map((row) => ({
    countryCode: normalizeCountryCatalogCode(row.country_code),
    stationCount: toNumber(row.station_count),
  }))
  const requestedCountryCode = options?.countryCode
    ? normalizeCountryCatalogCode(options.countryCode)
    : null
  const resolvedCountryCode =
    requestedCountryCode ||
    (stationCountries.length === 1 ? stationCountries[0].countryCode : null)
  const countryResolutionAmbiguous =
    !resolvedCountryCode && stationCountries.length !== 1

  const canonicalSummary = resolvedCountryCode
    ? await queryOne<{
        is_active: boolean
        content_hash: string | null
        row_count: string | number
      }>(
        `SELECT d.is_active,
                d.content_hash,
                COUNT(r.id) AS row_count
           FROM country_datasets d
           LEFT JOIN country_dataset_rows r
             ON r.country_code = d.country_code
          WHERE d.country_code = $1
          GROUP BY d.is_active, d.content_hash`,
        [resolvedCountryCode],
      )
    : null
  const canonicalCountRows = resolvedCountryCode
    ? await queryAll<{
        dataset_type: DatasetType
        row_count: string | number
      }>(
        `SELECT dataset_type, COUNT(*) AS row_count
           FROM country_dataset_rows
          WHERE country_code = $1
          GROUP BY dataset_type
          ORDER BY dataset_type`,
        [resolvedCountryCode],
      )
    : []
  const rowsByDatasetType: Record<string, number> = Object.fromEntries(
    DATASET_TYPES.map((datasetType) => [datasetType, 0]),
  )
  for (const row of canonicalCountRows) {
    rowsByDatasetType[row.dataset_type] = toNumber(row.row_count)
  }
  const missingDatasetTypes = DATASET_TYPES.filter(
    (datasetType) => rowsByDatasetType[datasetType] === 0,
  )

  const canonicalRows = resolvedCountryCode
    ? await queryAll<Record<string, unknown>>(
        `SELECT dataset_type, code, name, description, rate, is_active, sort_order
           FROM country_dataset_rows
          WHERE country_code = $1`,
        [resolvedCountryCode],
      )
    : []

  const compatibilityViewRows = await queryAll<{ view_name: string }>(
    `SELECT table_name AS view_name
       FROM information_schema.views
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [Object.values(COUNTRY_CATALOG_COMPATIBILITY_VIEWS)],
  )
  const readyViews = new Set(compatibilityViewRows.map((row) => row.view_name))
  const compatibilityViewsReady = Object.values(
    COUNTRY_CATALOG_COMPATIBILITY_VIEWS,
  ).every((view) => readyViews.has(view))

  const legacyTables: CountryCatalogLegacyTableAudit[] = []
  for (const [table, mapping] of Object.entries(
    LEGACY_COUNTRY_CONFIG_TABLES,
  ) as Array<
    [
      LegacyCountryConfigTable,
      (typeof LEGACY_COUNTRY_CONFIG_TABLES)[LegacyCountryConfigTable],
    ]
  >) {
    const exists = Boolean(
      (
        await queryOne<{ exists: boolean }>(
          `SELECT to_regclass(current_schema() || '.' || $1) IS NOT NULL AS exists`,
          [table],
        )
      )?.exists,
    )
    const legacyRows = exists
      ? await queryAll<Record<string, unknown>>(
          `SELECT code, name, description, ${mapping.includesRate ? 'rate' : 'NULL::numeric AS rate'}, is_active, sort_order
             FROM ${table}`,
        )
      : []
    const canonicalForType = canonicalRows.filter(
      (row) => row.dataset_type === mapping.datasetType,
    )
    const canonicalByCode = new Map(
      canonicalForType.map((row) => {
        const normalized = normalizeComparableRow(row)
        return [normalized.code, normalized]
      }),
    )
    const missingCanonicalCodes: string[] = []
    const differingCodes: string[] = []
    for (const row of legacyRows) {
      const normalized = normalizeComparableRow(row)
      const canonical = canonicalByCode.get(normalized.code)
      if (!canonical) {
        missingCanonicalCodes.push(normalized.code)
        continue
      }
      if (!rowsEquivalent(normalized, canonical, mapping.includesRate)) {
        differingCodes.push(normalized.code)
      }
    }
    const equivalentToCanonical =
      Boolean(resolvedCountryCode) &&
      missingCanonicalCodes.length === 0 &&
      differingCodes.length === 0 &&
      legacyRows.length === canonicalForType.length
    const dependencies = exists ? await listDependencies(table) : []
    const internalCompatibilityObjects = [
      ...Object.values(COUNTRY_CATALOG_COMPATIBILITY_VIEWS),
      'country_catalog_legacy_table_map',
    ]
    const externalDependencies = dependencies.filter(
      (dependency) =>
        !internalCompatibilityObjects.some((objectName) =>
          dependency.objectName.endsWith(`.${objectName}`),
        ),
    )
    const safeToRetire =
      !exists ||
      (Boolean(resolvedCountryCode) &&
        equivalentToCanonical &&
        externalDependencies.length === 0 &&
        compatibilityViewsReady)

    legacyTables.push({
      table,
      compatibilityView: COUNTRY_CATALOG_COMPATIBILITY_VIEWS[table],
      datasetType: mapping.datasetType,
      exists,
      rowCount: legacyRows.length,
      equivalentToCanonical,
      missingCanonicalCodes: missingCanonicalCodes.sort(),
      differingCodes: differingCodes.sort(),
      dependencies: externalDependencies,
      safeToRetire,
    })
  }

  const hashReady = /^[0-9a-f]{64}$/.test(
    String(canonicalSummary?.content_hash ?? ''),
  )
  const canonicalReady =
    Boolean(resolvedCountryCode) &&
    Boolean(canonicalSummary?.is_active) &&
    hashReady &&
    toNumber(canonicalSummary?.row_count) > 0 &&
    missingDatasetTypes.length === 0

  return {
    migrationApplied: Boolean(migration?.applied),
    requestedCountryCode,
    resolvedCountryCode,
    stationCountries,
    countryResolutionAmbiguous,
    canonical: {
      datasetActive: Boolean(canonicalSummary?.is_active),
      contentHash: canonicalSummary?.content_hash ?? null,
      hashReady,
      rowCount: toNumber(canonicalSummary?.row_count),
      rowsByDatasetType,
      missingDatasetTypes: [...missingDatasetTypes],
    },
    legacyTables,
    compatibilityViewsReady,
    safeForDestructiveMigration:
      Boolean(migration?.applied) &&
      canonicalReady &&
      compatibilityViewsReady &&
      legacyTables.every((table) => table.safeToRetire),
  }
}
