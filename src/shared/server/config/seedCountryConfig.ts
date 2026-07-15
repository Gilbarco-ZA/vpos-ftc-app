import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { BaseRow, TaxRow } from '@/src/shared/config/datasets/types'
import { loadCountryDataset } from '@/src/shared/server/config/countryDatasets'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

const CONFIG_SEEDED_COUNTRY = 'CONFIG_SEEDED_COUNTRY'
const CONFIG_SEEDED_AT = 'CONFIG_SEEDED_AT'

const normalizeCountry = (country: string) =>
  String(country || '')
    .trim()
    .toUpperCase()

const assertBaseRow = (row: BaseRow, table: string) => {
  if (!row.code || !String(row.code).trim()) {
    throw new Error(`Missing code for ${table}`)
  }
  if (!row.name || !String(row.name).trim()) {
    throw new Error(`Missing name for ${table} (${row.code})`)
  }
}

const assertTaxRow = (row: TaxRow) => {
  assertBaseRow(row, 'cfg_tax_types')
  if (row.rate == null || !Number.isFinite(Number(row.rate))) {
    throw new Error(`Missing rate for cfg_tax_types (${row.code})`)
  }
}

const getAppSetting = async (
  key: string,
  client: Parameters<typeof txQuery>[0],
) => {
  const res = await txQuery<{ value: string }>(
    client,
    `SELECT value FROM app_settings WHERE key = $1`,
    [key],
  )
  return res.rows[0]?.value ?? null
}

const setAppSetting = async (
  key: string,
  value: string,
  client: Parameters<typeof txQuery>[0],
) => {
  await txQuery(
    client,
    `INSERT INTO app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value],
  )
}

const insertBaseRows = async (
  client: Parameters<typeof txQuery>[0],
  table: string,
  rows: BaseRow[],
) => {
  if (!rows.length) return
  const values: any[] = []
  const placeholders = rows
    .map((row, index) => {
      assertBaseRow(row, table)
      const offset = index * 6
      const id = uuidv4()
      values.push(
        id,
        row.code,
        row.name,
        row.description ?? null,
        row.isActive ?? true,
        row.sortOrder ?? 0,
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
    })
    .join(', ')

  await txQuery(
    client,
    `INSERT INTO ${table} (id, code, name, description, is_active, sort_order)
     VALUES ${placeholders}
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       is_active = EXCLUDED.is_active,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW()`,
    values,
  )
}

const insertTaxRows = async (
  client: Parameters<typeof txQuery>[0],
  rows: TaxRow[],
) => {
  if (!rows.length) return
  const values: any[] = []
  const placeholders = rows
    .map((row, index) => {
      assertTaxRow(row)
      const offset = index * 7
      const id = uuidv4()
      values.push(
        id,
        row.code,
        row.name,
        row.description ?? null,
        row.rate,
        row.isActive ?? true,
        row.sortOrder ?? 0,
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
    })
    .join(', ')

  await txQuery(
    client,
    `INSERT INTO cfg_tax_types (id, code, name, description, rate, is_active, sort_order)
     VALUES ${placeholders}
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       rate = EXCLUDED.rate,
       is_active = EXCLUDED.is_active,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW()`,
    values,
  )
}

const coerceTaxRates = (rows: TaxRow[]) => {
  let warned = false
  return rows.map((row) => {
    const value = row.rate
    if (value == null || !Number.isFinite(Number(value))) {
      if (!warned) {
        logger.warn(
          '[seedCountryConfig] Tax type rate is null/invalid; coercing to 0',
        )
        warned = true
      }
      return { ...row, rate: 0 }
    }
    return row
  })
}

export const seedCountryConfig = async (
  countryCode: string,
  opts?: { force?: boolean },
): Promise<void> => {
  const normalized = normalizeCountry(countryCode)
  const dataset = await loadCountryDataset(normalized)
  const forced =
    Boolean(opts?.force) ||
    String(process.env.FORCE_SEED_CONFIG || '').toLowerCase() === 'true'

  await withTransaction(async (client) => {
    if (!forced) {
      const existing = await getAppSetting(CONFIG_SEEDED_COUNTRY, client)
      if (existing && existing === normalized) return
    }

    const safeTaxRows = coerceTaxRates(dataset.taxTypes)

    await insertTaxRows(client, safeTaxRows)
    await insertBaseRows(
      client,
      'cfg_product_class_codes',
      dataset.productClassCodes,
    )
    await insertBaseRows(
      client,
      'cfg_product_type_codes',
      dataset.productTypeCodes,
    )
    await insertBaseRows(
      client,
      'cfg_credit_note_reasons',
      dataset.creditNoteReasons,
    )
    await insertBaseRows(client, 'cfg_pack_sizes', dataset.packagingUnits)
    await insertBaseRows(client, 'cfg_units_of_measure', dataset.quantityUnits)

    await setAppSetting(CONFIG_SEEDED_COUNTRY, normalized, client)
    await setAppSetting(CONFIG_SEEDED_AT, new Date().toISOString(), client)
  })
}

let seedPromise: Promise<void> | null = null
let seedCountry: string | null = null

export const seedCountryConfigOnce = async (country: string): Promise<void> => {
  const normalized = normalizeCountry(country)
  if (!normalized) return
  if (seedPromise && seedCountry === normalized) {
    return seedPromise
  }
  seedCountry = normalized
  seedPromise = seedCountryConfig(normalized)
  return seedPromise
}
