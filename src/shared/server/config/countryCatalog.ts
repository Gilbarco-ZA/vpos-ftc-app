import type { LegacyCountryConfigTable } from '@/src/shared/config/countryCatalogPolicy'
import type {
  CountryDatasetRow,
  DatasetType,
} from '@/src/shared/server/config/countryDatasets'

import { mapRows, queryAll, queryOne } from '@/src/platform/db/postgres'
import {
  LEGACY_COUNTRY_CONFIG_TABLES,
  normalizeCountryCatalogCode,
} from '@/src/shared/config/countryCatalogPolicy'
import { bootstrapBundledCountryDatasets } from '@/src/shared/server/config/countryDatasets'

export type CountryCatalogTaxType = Pick<
  CountryDatasetRow,
  | 'id'
  | 'countryCode'
  | 'code'
  | 'name'
  | 'description'
  | 'isActive'
  | 'sortOrder'
> & {
  rate: number | null
}

export type CountryCatalogDiagnostics = {
  countryCode: string
  active: boolean
  countryName: string | null
  rowsByDatasetType: Record<DatasetType, number>
  samplesByDatasetType: Record<DatasetType, CountryDatasetRow[]>
}

const DATASET_TYPES: DatasetType[] = [
  'taxTypes',
  'productClassCodes',
  'productTypeCodes',
  'creditNoteReasons',
  'packagingUnits',
  'quantityUnits',
]

export const listActiveCountryCatalogRows = async (args: {
  countryCode: string
  datasetType: DatasetType
  limit?: number
}): Promise<CountryDatasetRow[]> => {
  await bootstrapBundledCountryDatasets()
  const countryCode = normalizeCountryCatalogCode(args.countryCode)
  const limit = Math.max(1, Math.min(10_000, Math.trunc(args.limit ?? 10_000)))

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT r.id,
            r.country_code,
            r.dataset_type,
            r.code,
            r.name,
            r.description,
            r.rate,
            r.is_active,
            r.sort_order,
            r.metadata_json
       FROM country_dataset_rows r
       JOIN country_datasets d
         ON d.country_code = r.country_code
        AND d.is_active = TRUE
      WHERE r.country_code = $1
        AND r.dataset_type = $2
        AND r.is_active = TRUE
      ORDER BY r.sort_order ASC, r.name ASC, r.code ASC
      LIMIT $3`,
    [countryCode, args.datasetType, limit],
  )

  return mapRows<CountryDatasetRow>(rows)
}

export const getDefaultTaxTypeForCountry = async (
  countryCodeInput: string | null | undefined,
): Promise<CountryCatalogTaxType | null> => {
  await bootstrapBundledCountryDatasets()
  const countryCode = normalizeCountryCatalogCode(countryCodeInput)
  if (!countryCode) return null

  const row = await queryOne<Record<string, unknown>>(
    `SELECT r.id,
            r.country_code,
            r.code,
            r.name,
            r.description,
            r.rate,
            r.is_active,
            r.sort_order
       FROM country_dataset_rows r
       JOIN country_datasets d
         ON d.country_code = r.country_code
        AND d.is_active = TRUE
      WHERE r.country_code = $1
        AND r.dataset_type = 'taxTypes'
        AND r.is_active = TRUE
      ORDER BY r.sort_order ASC, r.name ASC, r.code ASC
      LIMIT 1`,
    [countryCode],
  )

  if (!row) return null
  const mapped = mapRows<CountryCatalogTaxType>([row])[0]
  const rate = mapped.rate == null ? null : Number(mapped.rate)
  return {
    ...mapped,
    rate: Number.isFinite(rate) ? rate : null,
  }
}

export const getDefaultTaxTypeForStation = async (
  stationId: string,
): Promise<CountryCatalogTaxType | null> => {
  await bootstrapBundledCountryDatasets()
  const row = await queryOne<Record<string, unknown>>(
    `SELECT r.id,
            r.country_code,
            r.code,
            r.name,
            r.description,
            r.rate,
            r.is_active,
            r.sort_order
       FROM fuel_stations fs
       JOIN country_datasets d
         ON d.country_code = UPPER(BTRIM(fs.country))
        AND d.is_active = TRUE
       JOIN country_dataset_rows r
         ON r.country_code = d.country_code
        AND r.dataset_type = 'taxTypes'
        AND r.is_active = TRUE
      WHERE fs.id = $1
        AND fs.deleted_at IS NULL
      ORDER BY r.sort_order ASC, r.name ASC, r.code ASC
      LIMIT 1`,
    [stationId],
  )

  if (!row) return null
  const mapped = mapRows<CountryCatalogTaxType>([row])[0]
  const rate = mapped.rate == null ? null : Number(mapped.rate)
  return {
    ...mapped,
    rate: Number.isFinite(rate) ? rate : null,
  }
}

export const getCountryCatalogDiagnostics = async (
  countryCodeInput: string,
  sampleLimit = 5,
): Promise<CountryCatalogDiagnostics> => {
  await bootstrapBundledCountryDatasets()
  const countryCode = normalizeCountryCatalogCode(countryCodeInput)
  const summary = await queryOne<{
    country_name: string | null
    is_active: boolean
  }>(
    `SELECT country_name, is_active
       FROM country_datasets
      WHERE country_code = $1`,
    [countryCode],
  )

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id,
            country_code,
            dataset_type,
            code,
            name,
            description,
            rate,
            is_active,
            sort_order,
            metadata_json
       FROM country_dataset_rows
      WHERE country_code = $1
      ORDER BY dataset_type, sort_order ASC, name ASC, code ASC`,
    [countryCode],
  )
  const mapped = mapRows<CountryDatasetRow>(rows)
  const rowsByDatasetType = Object.fromEntries(
    DATASET_TYPES.map((datasetType) => [
      datasetType,
      mapped.filter((row) => row.datasetType === datasetType).length,
    ]),
  ) as Record<DatasetType, number>
  const samplesByDatasetType = Object.fromEntries(
    DATASET_TYPES.map((datasetType) => [
      datasetType,
      mapped
        .filter((row) => row.datasetType === datasetType)
        .slice(0, Math.max(0, Math.trunc(sampleLimit))),
    ]),
  ) as Record<DatasetType, CountryDatasetRow[]>

  return {
    countryCode,
    active: Boolean(summary?.is_active),
    countryName: summary?.country_name ?? null,
    rowsByDatasetType,
    samplesByDatasetType,
  }
}

export const listLegacyCountryConfigTables = (): LegacyCountryConfigTable[] =>
  Object.keys(LEGACY_COUNTRY_CONFIG_TABLES) as LegacyCountryConfigTable[]
