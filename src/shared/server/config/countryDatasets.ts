import { createHash } from 'node:crypto'
import type {
  BaseRow,
  CountryDataset,
  TaxRow,
} from '@/src/shared/config/datasets/types'
import type { PoolClient } from 'pg'

import {
  mapRows,
  query,
  queryAll,
  queryOne,
  txQuery,
  withTransaction,
} from '@/src/platform/db/postgres'
import { BUNDLED_COUNTRY_DATASETS } from '@/src/shared/config/datasets/registry'
import { bootstrapDefaultLanguages } from '@/src/shared/server/i18n/languages'
import { uuidv4 } from '@/src/shared/utils/uuid'

export const DATASET_TYPES = [
  'taxTypes',
  'productClassCodes',
  'productTypeCodes',
  'creditNoteReasons',
  'packagingUnits',
  'quantityUnits',
] as const

export type DatasetType = (typeof DATASET_TYPES)[number]

export type CountryDatasetSummary = {
  id: string
  countryCode: string
  countryName: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
  isActive: boolean
  isSystem: boolean
  source?: string | null
  version: number
  contentHash?: string | null
  rowCount: number
  importedAt?: string | null
  updatedAt?: string | null
}

export type SetupCountryOption = {
  value: string
  label: string
  countryCode: string
  countryName: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
}

export type CountryDatasetRow = {
  id: string
  countryCode: string
  datasetType: DatasetType
  code: string
  name: string
  description?: string | null
  rate?: number | null
  isActive: boolean
  sortOrder: number
  metadataJson?: Record<string, unknown>
}

export type CountryDatasetImportPayload = {
  countryCode: string
  countryName: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
  isActive?: boolean
  isSystem?: boolean
  source?: string | null
  version?: number
  dataset: CountryDataset
}

export type UpsertCountryDatasetOptions = {
  /** Replace all rows for this country before importing. Use true for admin imports. */
  replaceRows?: boolean
  /** Update rows that already exist. Use false for bundled bootstrap so admin edits are not overwritten. */
  overwriteRows?: boolean
  /** Update the country header fields. Use false for bundled bootstrap so enable/disable choices persist. */
  overwriteMetadata?: boolean
}

const normalizeCountryCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()

const normalizeLanguageCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()

const normalizeDatasetType = (value: unknown): DatasetType => {
  const type = String(value || '').trim() as DatasetType
  if (!DATASET_TYPES.includes(type))
    throw new Error(`Unsupported dataset type: ${value}`)
  return type
}

const datasetRows = (
  dataset: CountryDataset,
  datasetType: DatasetType,
): Array<BaseRow | TaxRow> => {
  const rows = dataset[datasetType]
  return Array.isArray(rows) ? rows : []
}

const normalizeDatasetRowForHash = (row: BaseRow | TaxRow) => ({
  code: String(row.code || '').trim(),
  name: String(row.name || '').trim(),
  description: row.description == null ? null : String(row.description).trim(),
  rate:
    'rate' in row && row.rate != null && Number.isFinite(Number(row.rate))
      ? Number(row.rate)
      : null,
  isActive: row.isActive ?? true,
  sortOrder: Number(row.sortOrder ?? 0),
})

export const calculateCountryDatasetHash = (dataset: CountryDataset) => {
  const canonical = Object.fromEntries(
    DATASET_TYPES.map((datasetType) => [
      datasetType,
      datasetRows(dataset, datasetType)
        .map(normalizeDatasetRowForHash)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.code.localeCompare(right.code) ||
            left.name.localeCompare(right.name),
        ),
    ]),
  )
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

const mapDatasetRowsToDataset = (rows: CountryDatasetRow[]): CountryDataset => {
  const byType = (datasetType: DatasetType) =>
    rows.filter((row) => row.datasetType === datasetType)
  const toBaseRows = (datasetType: DatasetType): BaseRow[] =>
    byType(datasetType).map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    }))

  return {
    taxTypes: byType('taxTypes').map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      rate: Number(row.rate ?? 0),
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    })),
    productClassCodes: toBaseRows('productClassCodes'),
    productTypeCodes: toBaseRows('productTypeCodes'),
    creditNoteReasons: toBaseRows('creditNoteReasons'),
    packagingUnits: toBaseRows('packagingUnits'),
    quantityUnits: toBaseRows('quantityUnits'),
  }
}

export const refreshCountryDatasetContentHash = async (
  countryCodeInput: string,
) => {
  const countryCode = normalizeCountryCode(countryCodeInput)
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, country_code, dataset_type, code, name, description, rate, is_active, sort_order, metadata_json
       FROM country_dataset_rows
      WHERE country_code = $1
      ORDER BY dataset_type, sort_order ASC, name ASC, code ASC`,
    [countryCode],
  )
  const dataset = mapDatasetRowsToDataset(mapRows<CountryDatasetRow>(rows))
  const contentHash = calculateCountryDatasetHash(dataset)
  await query(
    `UPDATE country_datasets
        SET content_hash = $2,
            updated_at = NOW()
      WHERE country_code = $1
        AND content_hash IS DISTINCT FROM $2`,
    [countryCode, contentHash],
  )
  return contentHash
}

const assertDatasetShape = (payload: CountryDatasetImportPayload) => {
  const countryCode = normalizeCountryCode(payload.countryCode)
  const countryName = String(payload.countryName || '').trim()
  if (!countryCode) throw new Error('countryCode is required')
  if (!/^[A-Z]{2,3}$/.test(countryCode)) {
    throw new Error('countryCode must be a 2 or 3 character ISO-style code')
  }
  if (!countryName) throw new Error('countryName is required')
  if (!payload.dataset || typeof payload.dataset !== 'object') {
    throw new Error('dataset is required')
  }
  for (const type of DATASET_TYPES) {
    if (!Array.isArray((payload.dataset as any)[type])) {
      throw new Error(`dataset.${type} must be an array`)
    }
  }
}

const assertBaseRow = (row: BaseRow, datasetType: DatasetType) => {
  if (!String(row.code || '').trim())
    throw new Error(`Missing code for ${datasetType}`)
  if (!String(row.name || '').trim())
    throw new Error(`Missing name for ${datasetType} (${row.code})`)
}

const assertTaxRow = (row: TaxRow) => {
  assertBaseRow(row, 'taxTypes')
  if (row.rate == null || !Number.isFinite(Number(row.rate))) {
    throw new Error(`Missing rate for taxTypes (${row.code})`)
  }
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size))
  return chunks
}

const insertRows = async (
  client: PoolClient,
  countryCode: string,
  datasetType: DatasetType,
  rows: Array<BaseRow | TaxRow>,
  opts?: { overwriteRows?: boolean },
) => {
  const overwriteRows = opts?.overwriteRows !== false
  for (const rowChunk of chunk(rows, 500)) {
    const values: any[] = []
    const placeholders = rowChunk
      .map((row, index) => {
        if (datasetType === 'taxTypes') assertTaxRow(row as TaxRow)
        else assertBaseRow(row, datasetType)
        const offset = index * 10
        values.push(
          uuidv4(),
          countryCode,
          datasetType,
          String(row.code).trim(),
          String(row.name).trim(),
          row.description ?? null,
          datasetType === 'taxTypes' ? Number((row as TaxRow).rate ?? 0) : null,
          row.isActive ?? true,
          row.sortOrder ?? 0,
          '{}',
        )
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::jsonb)`
      })
      .join(', ')

    if (!placeholders) continue
    const conflictClause = overwriteRows
      ? `DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         rate = EXCLUDED.rate,
         is_active = EXCLUDED.is_active,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`
      : 'DO NOTHING'

    await txQuery(
      client,
      `INSERT INTO country_dataset_rows
         (id, country_code, dataset_type, code, name, description, rate, is_active, sort_order, metadata_json)
       VALUES ${placeholders}
       ON CONFLICT (country_code, dataset_type, code) ${conflictClause}`,
      values,
    )
  }
}

export const upsertCountryDataset = async (
  payload: CountryDatasetImportPayload,
  options?: UpsertCountryDatasetOptions,
) => {
  assertDatasetShape(payload)
  await bootstrapDefaultLanguages()
  const countryCode = normalizeCountryCode(payload.countryCode)
  const countryName = String(payload.countryName || '').trim()
  const languageCode =
    normalizeLanguageCode(payload.defaultLanguageCode || 'en') || 'en'

  const replaceRows = options?.replaceRows !== false
  const overwriteRows = options?.overwriteRows !== false
  const overwriteMetadata = options?.overwriteMetadata !== false
  const contentHash = calculateCountryDatasetHash(payload.dataset)

  await withTransaction(async (client) => {
    await txQuery(
      client,
      `INSERT INTO country_datasets
         (id, country_code, country_name, currency_code, timezone, default_language_code, is_active, is_system, source, version, content_hash, imported_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (country_code) DO UPDATE SET
         country_name = CASE WHEN $12 THEN EXCLUDED.country_name ELSE country_datasets.country_name END,
         currency_code = CASE WHEN $12 THEN EXCLUDED.currency_code ELSE country_datasets.currency_code END,
         timezone = CASE WHEN $12 THEN EXCLUDED.timezone ELSE country_datasets.timezone END,
         default_language_code = CASE WHEN $12 THEN EXCLUDED.default_language_code ELSE country_datasets.default_language_code END,
         is_active = CASE WHEN $12 THEN EXCLUDED.is_active ELSE country_datasets.is_active END,
         is_system = country_datasets.is_system OR EXCLUDED.is_system,
         source = CASE WHEN $12 THEN EXCLUDED.source ELSE country_datasets.source END,
         version = CASE WHEN $12 THEN EXCLUDED.version ELSE country_datasets.version END,
         content_hash = CASE WHEN $12 THEN EXCLUDED.content_hash ELSE country_datasets.content_hash END,
         imported_at = CASE WHEN $12 THEN NOW() ELSE country_datasets.imported_at END,
         updated_at = CASE WHEN $12 THEN NOW() ELSE country_datasets.updated_at END`,
      [
        uuidv4(),
        countryCode,
        countryName,
        payload.currencyCode ?? null,
        payload.timezone ?? null,
        languageCode,
        payload.isActive ?? true,
        payload.isSystem ?? false,
        payload.source ?? null,
        payload.version ?? 1,
        contentHash,
        overwriteMetadata,
      ],
    )

    if (replaceRows) {
      await txQuery(
        client,
        `DELETE FROM country_dataset_rows WHERE country_code = $1`,
        [countryCode],
      )
    }

    for (const type of DATASET_TYPES) {
      await insertRows(
        client,
        countryCode,
        type,
        datasetRows(payload.dataset, type),
        {
          overwriteRows,
        },
      )
    }
  })

  return await getCountryDatasetSummaryInternal(countryCode)
}

let bootstrapPromise: Promise<void> | null = null

export const bootstrapBundledCountryDatasets = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      for (const item of BUNDLED_COUNTRY_DATASETS) {
        await upsertCountryDataset(
          {
            countryCode: item.countryCode,
            countryName: item.countryName,
            currencyCode: item.currencyCode,
            timezone: item.timezone,
            defaultLanguageCode: item.defaultLanguageCode,
            isActive: true,
            isSystem: true,
            source: `src/shared/config/datasets/${item.countryCode}.ts`,
            version: 1,
            dataset: item.dataset,
          },
          {
            replaceRows: false,
            overwriteRows: false,
            overwriteMetadata: false,
          },
        )
        await refreshCountryDatasetContentHash(item.countryCode)
      }
    })()
  }
  return bootstrapPromise
}

export const listCountryDatasetSummaries = async (opts?: {
  activeOnly?: boolean
}) => {
  await bootstrapBundledCountryDatasets()
  const where = opts?.activeOnly ? 'WHERE d.is_active = TRUE' : ''
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT
       d.id,
       d.country_code,
       d.country_name,
       d.currency_code,
       d.timezone,
       d.default_language_code,
       d.is_active,
       d.is_system,
       d.source,
       d.version,
       d.content_hash,
       d.imported_at,
       d.updated_at,
       COALESCE(COUNT(r.id), 0)::int AS row_count
     FROM country_datasets d
     LEFT JOIN country_dataset_rows r ON r.country_code = d.country_code
     ${where}
     GROUP BY d.id
     ORDER BY d.country_name ASC, d.country_code ASC`,
  )
  return mapRows<CountryDatasetSummary>(rows)
}

const getCountryDatasetSummaryInternal = async (countryCodeInput: string) => {
  const countryCode = normalizeCountryCode(countryCodeInput)
  const row = await queryOne<Record<string, unknown>>(
    `SELECT
       d.id,
       d.country_code,
       d.country_name,
       d.currency_code,
       d.timezone,
       d.default_language_code,
       d.is_active,
       d.is_system,
       d.source,
       d.version,
       d.content_hash,
       d.imported_at,
       d.updated_at,
       COALESCE(COUNT(r.id), 0)::int AS row_count
     FROM country_datasets d
     LEFT JOIN country_dataset_rows r ON r.country_code = d.country_code
     WHERE d.country_code = $1
     GROUP BY d.id`,
    [countryCode],
  )
  return row ? mapRows<CountryDatasetSummary>([row])[0] : null
}

export const getCountryDatasetSummary = async (countryCodeInput: string) => {
  await bootstrapBundledCountryDatasets()
  return await getCountryDatasetSummaryInternal(countryCodeInput)
}

export const listSetupCountryOptions = async (): Promise<
  SetupCountryOption[]
> => {
  const countries = await listCountryDatasetSummaries({ activeOnly: true })
  return countries.map((country) => ({
    value: country.countryCode,
    label: `${country.countryName} (${country.countryCode})`,
    countryCode: country.countryCode,
    countryName: country.countryName,
    currencyCode: country.currencyCode ?? null,
    timezone: country.timezone ?? null,
    defaultLanguageCode: country.defaultLanguageCode ?? null,
  }))
}

export const isSupportedCountryCode = async (countryCodeInput: string) => {
  const countryCode = normalizeCountryCode(countryCodeInput)
  if (!countryCode) return false
  await bootstrapBundledCountryDatasets()
  const row = await queryOne<{ exists: boolean }>(
    `SELECT TRUE AS exists FROM country_datasets WHERE country_code = $1 AND is_active = TRUE LIMIT 1`,
    [countryCode],
  )
  return Boolean(row?.exists)
}

export const listCountryDatasetRows = async (args: {
  countryCode: string
  datasetType: DatasetType
  activeOnly?: boolean
}) => {
  await bootstrapBundledCountryDatasets()
  const countryCode = normalizeCountryCode(args.countryCode)
  const datasetType = normalizeDatasetType(args.datasetType)
  const activeWhere = args.activeOnly ? 'AND is_active = TRUE' : ''
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, country_code, dataset_type, code, name, description, rate, is_active, sort_order, metadata_json
     FROM country_dataset_rows
     WHERE country_code = $1 AND dataset_type = $2 ${activeWhere}
     ORDER BY sort_order ASC, name ASC, code ASC`,
    [countryCode, datasetType],
  )
  return mapRows<CountryDatasetRow>(rows)
}

export const upsertCountryDatasetRow = async (input: {
  id?: string | null
  countryCode: string
  datasetType: DatasetType
  code: string
  name: string
  description?: string | null
  rate?: number | null
  isActive?: boolean
  sortOrder?: number
}) => {
  const countryCode = normalizeCountryCode(input.countryCode)
  const datasetType = normalizeDatasetType(input.datasetType)
  const code = String(input.code || '').trim()
  const name = String(input.name || '').trim()
  if (!countryCode) throw new Error('countryCode is required')
  if (!code) throw new Error('code is required')
  if (!name) throw new Error('name is required')
  if (!(await getCountryDatasetSummary(countryCode)))
    throw new Error('Unknown country dataset')
  if (
    datasetType === 'taxTypes' &&
    (input.rate == null || !Number.isFinite(Number(input.rate)))
  ) {
    throw new Error('rate is required for tax types')
  }

  await query(
    `INSERT INTO country_dataset_rows
       (id, country_code, dataset_type, code, name, description, rate, is_active, sort_order, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb)
     ON CONFLICT (country_code, dataset_type, code) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       rate = EXCLUDED.rate,
       is_active = EXCLUDED.is_active,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW()`,
    [
      input.id || uuidv4(),
      countryCode,
      datasetType,
      code,
      name,
      input.description ?? null,
      datasetType === 'taxTypes' ? Number(input.rate ?? 0) : null,
      input.isActive ?? true,
      input.sortOrder ?? 0,
    ],
  )

  await refreshCountryDatasetContentHash(countryCode)
  return await listCountryDatasetRows({ countryCode, datasetType })
}

export const setCountryDatasetActive = async (
  countryCodeInput: string,
  isActive: boolean,
) => {
  await bootstrapBundledCountryDatasets()
  const countryCode = normalizeCountryCode(countryCodeInput)
  if (!countryCode) throw new Error('countryCode is required')
  await query(
    `UPDATE country_datasets SET is_active = $2, updated_at = NOW() WHERE country_code = $1`,
    [countryCode, isActive],
  )
  return await listCountryDatasetSummaries()
}

export const loadCountryDataset = async (
  countryCodeInput: string,
): Promise<CountryDataset> => {
  await bootstrapBundledCountryDatasets()
  const countryCode = normalizeCountryCode(countryCodeInput)
  if (!(await isSupportedCountryCode(countryCode)))
    throw new Error(`Unsupported country code: ${countryCodeInput}`)

  const [
    taxTypes,
    productClassCodes,
    productTypeCodes,
    creditNoteReasons,
    packagingUnits,
    quantityUnits,
  ] = await Promise.all([
    listCountryDatasetRows({
      countryCode,
      datasetType: 'taxTypes',
      activeOnly: true,
    }),
    listCountryDatasetRows({
      countryCode,
      datasetType: 'productClassCodes',
      activeOnly: true,
    }),
    listCountryDatasetRows({
      countryCode,
      datasetType: 'productTypeCodes',
      activeOnly: true,
    }),
    listCountryDatasetRows({
      countryCode,
      datasetType: 'creditNoteReasons',
      activeOnly: true,
    }),
    listCountryDatasetRows({
      countryCode,
      datasetType: 'packagingUnits',
      activeOnly: true,
    }),
    listCountryDatasetRows({
      countryCode,
      datasetType: 'quantityUnits',
      activeOnly: true,
    }),
  ])

  return mapDatasetRowsToDataset([
    ...taxTypes,
    ...productClassCodes,
    ...productTypeCodes,
    ...creditNoteReasons,
    ...packagingUnits,
    ...quantityUnits,
  ])
}

export const resetCountryDatasetToBundledDefaults = async (
  countryCodeInput: string,
) => {
  const countryCode = normalizeCountryCode(countryCodeInput)
  const bundled = BUNDLED_COUNTRY_DATASETS.find(
    (item) => item.countryCode === countryCode,
  )
  if (!bundled) {
    throw new Error(`No bundled defaults are available for ${countryCodeInput}`)
  }

  return await upsertCountryDataset(
    {
      countryCode: bundled.countryCode,
      countryName: bundled.countryName,
      currencyCode: bundled.currencyCode ?? null,
      timezone: bundled.timezone ?? null,
      defaultLanguageCode: bundled.defaultLanguageCode ?? 'en',
      isActive: true,
      isSystem: true,
      source: `src/shared/config/datasets/${bundled.countryCode}.ts`,
      version: 1,
      dataset: bundled.dataset,
    },
    {
      replaceRows: true,
      overwriteRows: true,
      overwriteMetadata: true,
    },
  )
}
