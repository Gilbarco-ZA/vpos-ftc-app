import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildPssXmlImportSummary,
  summarizeLegacyParsedPssXml,
} from '@/src/shared/integrations/pssXml/importSummary'
import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import { buildStorageRetentionTargets } from '@/src/platform/retention/storageRetentionTargets'

test('PSS import summary is compact and captures parsed and normalized counts', () => {
  const summary = buildPssXmlImportSummary({
    parsed: {
      grades: [{ id: '1', name: 'ULP' }],
      priceGroups: [{ id: '1', pricesByGradeId: { '1': 1234 } }],
      products: [{ id: '1', name: 'ULP' }],
      tanks: [{ id: '1', productId: '1' }],
      tankGauges: [{ id: '1', tankId: '1' }],
      fuellingPoints: [
        {
          id: '1',
          gradeOptions: [
            { id: '1', gradeId: '1', tankId: '1' },
            { id: '2', gradeId: '1', tankId: '1' },
          ],
        },
      ],
    },
    sourceChecksum: 'abc',
    sourcePath: '/tmp/config.xml',
    importedAt: '2026-07-21T00:00:00.000Z',
    sourceBytes: 123,
    importedProducts: 1,
    importedTanks: 1,
    importedPumps: 1,
  })

  assert.equal(summary.version, 1)
  assert.equal(summary.sourceBytes, 123)
  assert.deepEqual(summary.parsedCounts, {
    grades: 1,
    priceGroups: 1,
    products: 1,
    tanks: 1,
    tankGauges: 1,
    fuellingPoints: 1,
    gradeOptions: 2,
  })
  assert.deepEqual(summary.normalizedCounts, {
    products: 1,
    tanks: 1,
    pumps: 1,
  })
  assert.ok(JSON.stringify(summary).length < 1024)
})

test('legacy parsed PSS data can be summarized without returning the full object', () => {
  const summary = summarizeLegacyParsedPssXml({
    parsed: {
      grades: [{ id: '1' }, { id: '2' }],
      tanks: [{ id: '1' }],
      fuellingPoints: [{ gradeOptions: [{ id: '1' }] }],
    },
    sourceChecksum: 'legacy',
    importedAt: '2026-07-20T00:00:00.000Z',
  })

  assert.equal(summary?.parsedCounts.grades, 2)
  assert.equal(summary?.parsedCounts.tanks, 1)
  assert.equal(summary?.parsedCounts.fuellingPoints, 1)
  assert.equal(summary?.parsedCounts.gradeOptions, 1)
  assert.equal(summary?.normalizedCounts.products, 0)
})

test('new PSS imports write a compact summary and never persist parsed JSON', () => {
  const importer = readFileSync(
    'src/modules/setup/infrastructure/pssXmlImporter.ts',
    'utf8',
  )
  const status = readFileSync(
    'src/modules/admin-integrations/application/getAdminPssXmlStatus.ts',
    'utf8',
  )

  assert.match(importer, /PSS_XML_KEYS\.IMPORT_SUMMARY/)
  assert.doesNotMatch(importer, /kvSet\([^\n]*PSS_XML_KEYS\.PARSED_JSON/)
  assert.match(
    importer,
    /return\s*\{\s*checksum,\s*importSummary,\s*importedProducts:\s*importedProductsCount,/,
  )
  assert.match(status, /isPssXmlImportSummary/)
  assert.match(status, /summarizeLegacyParsedPssXml/)
  assert.doesNotMatch(status, /return\s*\{[\s\S]*\n\s*parsed\s*[,}]/)
})

test('parsed PSS compatibility cleanup requires every durable replacement', () => {
  const targets = buildStorageRetentionTargets(getStorageRetentionPolicy({}))
  const target = targets.find(
    (candidate) => candidate.key === 'pss_xml_parsed_duplicate',
  )

  assert.ok(target)
  assert.equal(target?.table, 'station_kv')
  assert.match(target?.eligibilitySql ?? '', /pss\.xml\.importSummary/)
  assert.match(target?.eligibilitySql ?? '', /pss\.xml\.raw/)
  assert.match(target?.eligibilitySql ?? '', /pss\.xml\.idMap/)
  assert.equal(target?.retentionDays, 30)
})

test('Phase 5C migration backfills summary but performs no destructive cleanup', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1265_pss_summary_config_version_retention.sql',
    'utf8',
  )

  assert.match(migration, /pss\.xml\.importSummary/)
  assert.match(migration, /jsonb_array_length/)
  assert.match(migration, /ON CONFLICT \(station_id, key\) DO NOTHING/)
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+station_kv/i)
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)/i)
})
