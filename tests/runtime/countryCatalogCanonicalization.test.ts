import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  COUNTRY_CATALOG_COMPATIBILITY_VIEWS,
  LEGACY_COUNTRY_CONFIG_TABLES,
  getLegacyCountryConfigMapping,
  isValidCountryCatalogCode,
  normalizeCountryCatalogCode,
} from '@/src/shared/config/countryCatalogPolicy'
import { BUNDLED_COUNTRY_DATASETS } from '@/src/shared/config/datasets/registry'
import { calculateCountryDatasetHash } from '@/src/shared/server/config/countryDatasets'

const runtimeSourceFiles = () => {
  const files: string[] = []
  const walk = (entry: string) => {
    for (const name of readdirSync(entry)) {
      const full = path.join(entry, name)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        if (
          full.includes(`${path.sep}migrations`) ||
          full.includes(`${path.sep}config${path.sep}audit`)
        ) {
          continue
        }
        walk(full)
      } else if (/\.(?:ts|tsx|js|cjs|mjs)$/.test(name)) {
        files.push(full)
      }
    }
  }
  ;['app', 'src', 'server', 'workers', 'scripts'].forEach(walk)
  return files
}

test('legacy country tables map one-to-one to canonical dataset types', () => {
  assert.deepEqual(Object.keys(LEGACY_COUNTRY_CONFIG_TABLES).sort(), [
    'cfg_credit_note_reasons',
    'cfg_pack_sizes',
    'cfg_product_class_codes',
    'cfg_product_type_codes',
    'cfg_tax_types',
    'cfg_units_of_measure',
  ])
  assert.equal(
    getLegacyCountryConfigMapping('cfg_tax_types')?.datasetType,
    'taxTypes',
  )
  assert.equal(getLegacyCountryConfigMapping('not_a_table'), null)
  assert.equal(
    new Set(Object.values(COUNTRY_CATALOG_COMPATIBILITY_VIEWS)).size,
    6,
  )
})

test('country catalog codes are normalized and validated explicitly', () => {
  assert.equal(normalizeCountryCatalogCode(' tz '), 'TZ')
  assert.equal(isValidCountryCatalogCode('KE'), true)
  assert.equal(isValidCountryCatalogCode('TZA'), true)
  assert.equal(isValidCountryCatalogCode(''), false)
  assert.equal(isValidCountryCatalogCode('TANZANIA'), false)
})

test('country dataset hashes are deterministic across row ordering', () => {
  const source = BUNDLED_COUNTRY_DATASETS[0].dataset
  const reversed = Object.fromEntries(
    Object.entries(source).map(([key, rows]) => [key, [...rows].reverse()]),
  ) as typeof source

  assert.match(calculateCountryDatasetHash(source), /^[0-9a-f]{64}$/)
  assert.equal(
    calculateCountryDatasetHash(source),
    calculateCountryDatasetHash(reversed),
  )
})

test('every bundled country has all canonical dataset groups populated', () => {
  for (const country of BUNDLED_COUNTRY_DATASETS) {
    for (const datasetType of Object.values(LEGACY_COUNTRY_CONFIG_TABLES).map(
      (entry) => entry.datasetType,
    )) {
      assert.ok(
        country.dataset[datasetType].length > 0,
        `${country.countryCode}.${datasetType} must not be empty`,
      )
    }
  }
})

test('runtime code no longer reads or writes duplicated cfg tables', () => {
  const allowed = new Set([
    path.normalize('src/shared/config/countryCatalogPolicy.ts'),
  ])
  const references = runtimeSourceFiles().filter((file) => {
    if (allowed.has(path.normalize(file))) return false
    return /\bcfg_(?:tax_types|product_class_codes|product_type_codes|credit_note_reasons|pack_sizes|units_of_measure)\b/.test(
      readFileSync(file, 'utf8'),
    )
  })

  assert.deepEqual(references, [])
  assert.equal(
    existsSync('src/shared/server/config/seedCountryConfig.ts'),
    false,
  )
})

test('transaction fiscalization resolves tax configuration by station country', () => {
  const transactionSql = readFileSync(
    'src/modules/transactions/infrastructure/persistence/transaction.sql.ts',
    'utf8',
  )
  const transactionFiscalization = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts',
    'utf8',
  )
  const proxyBuilder = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/buildProxyInvoiceForTransaction.ts',
    'utf8',
  )
  const proxyWorker = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts',
    'utf8',
  )

  assert.match(transactionSql, /JOIN country_dataset_rows r/)
  assert.match(transactionSql, /r\.dataset_type = 'taxTypes'/)
  assert.match(transactionFiscalization, /getDefaultTaxTypeSql,[\s\S]*\[stationId\]/)
  assert.match(proxyBuilder, /getDefaultTaxTypeForCountry\(country\)/)
  assert.match(proxyWorker, /getDefaultTaxTypeForCountry\(country\)/)
})

test('Phase 5B migration supplies rollback mappings without destructive drops', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1264_country_catalog_canonical.sql',
    'utf8',
  )

  assert.match(migration, /country_catalog_legacy_table_map/)
  assert.match(migration, /country_catalog_cfg_tax_types_compat/)
  assert.match(migration, /Filter by country_code/)
  assert.match(migration, /DEPRECATED duplicate country catalog/)
  assert.match(migration, /content_hash TEXT/)
  assert.doesNotMatch(migration, /DROP TABLE\s+cfg_/i)
  assert.doesNotMatch(migration, /DELETE FROM\s+cfg_/i)
  assert.doesNotMatch(migration, /TRUNCATE\s+cfg_/i)
})

test('country catalog audit blocks ambiguous or non-equivalent retirement', () => {
  const audit = readFileSync(
    'src/platform/config/audit/countryCatalogAudit.ts',
    'utf8',
  )

  assert.match(audit, /countryResolutionAmbiguous/)
  assert.match(audit, /equivalentToCanonical/)
  assert.match(audit, /missingCanonicalCodes/)
  assert.match(audit, /differingCodes/)
  assert.match(audit, /pg_get_functiondef/)
  assert.match(audit, /pg_get_triggerdef/)
  assert.match(audit, /compatibilityViewsReady/)
  assert.match(audit, /hashReady/)
  assert.match(audit, /safeForDestructiveMigration/)
})
