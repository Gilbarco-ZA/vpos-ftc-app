import crypto from 'crypto'
import * as fs from 'fs/promises'
import path from 'path'

import { getPool } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  'scripts',
  'migrations',
  'postgres',
)

const CHECKSUM_BYPASS = new Set([
  '0001_common_extensions_and_functions.sql',
  '024_products.sql',
  '025_products_class_type_codes.sql',
  '026_transactions_fiscal_document_id.sql',
  '027_customers_buyer_model.sql',
  '028_remove_legacy_columns.sql',
  '029_rename_tax_tin.sql',
  '030_add_pending_transaction_status.sql',
  '031_device_local_config_tables.sql',
  '032_app_settings.sql',
  '033_pumps_tanks.sql',
  '034_pumps_tanks_join.sql',
  '035_nozzles.sql',
  '036_product_price_slices.sql',
  '037_rename_pump_number.sql',
  '038_transaction_lines.sql',
])

let migrationsPromise: Promise<void> | null = null

export const ensurePostgresMigrations = async (): Promise<void | null> => {
  if (!migrationsPromise) migrationsPromise = runMigrations()
  return migrationsPromise
}

const runMigrations = async (): Promise<void> => {
  const pool = getPool()
  const client = await pool.connect()

  const LOCK_KEY_1 = 941227
  const LOCK_KEY_2 = 220911

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      LOCK_KEY_1,
      LOCK_KEY_2,
    ])

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    let files: string[] = []
    try {
      files = (await fs.readdir(MIGRATIONS_DIR, {
        encoding: 'utf8',
      })) as string[]
    } catch {
      logger.warn('[migrations]', {
        msg: `Migrations directory not found: ${MIGRATIONS_DIR}`,
      })
      return
    }

    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

    for (const file of sqlFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file)
      const sqlRaw = await fs.readFile(filePath, 'utf-8')

      const sqlLf = canonicalizeLf(sqlRaw)
      const sqlCrlf = sqlLf.replace(/\n/g, '')

      const checksumCanonical = hashString(sqlLf)
      const checksumLegacyRaw = hashString(sqlRaw)
      const checksumLegacyCrlf = hashString(sqlCrlf)

      const existing = await client.query(
        `SELECT checksum FROM schema_migrations WHERE name = $1`,
        [file],
      )
      if (existing.rows.length) {
        const previous = existing.rows[0]?.checksum as string
        const accepted = new Set([
          checksumCanonical,
          checksumLegacyRaw,
          checksumLegacyCrlf,
        ])

        if (!accepted.has(previous)) {
          if (!CHECKSUM_BYPASS.has(file)) {
            throw new Error(
              `Migration checksum mismatch for ${file}. Refusing to reapply.`,
            )
          }
          logger.warn('[migrations]', {
            msg: `Migration checksum mismatch for ${file}. Skipping reapply (bypass enabled).`,
          })
        }
        continue
      }

      try {
        await client.query('BEGIN')
        await client.query(sqlRaw)
        await client.query(
          `INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)`,
          [file, checksumCanonical],
        )
        await client.query('COMMIT')
        logger.info('[migrations]', { msg: `Applied migration: ${file}` })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        LOCK_KEY_1,
        LOCK_KEY_2,
      ])
    } catch {}
    client.release()
  }
}

const canonicalizeLf = (value: string): string => {
  return value.replace(/\r\n/g, '\n')
}

const hashString = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex')
}
