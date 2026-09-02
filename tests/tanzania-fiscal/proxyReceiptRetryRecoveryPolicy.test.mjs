import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tanzania proxy retries retain separate invoice and verification identities', () => {
  const receiptBuilder = read(
    'src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts',
  )
  const receiptRoute = read(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
  )
  const receiptRepository = read(
    'src/modules/transactions/infrastructure/persistence/transaction-read.repository.ts',
  )
  const worker = read(
    'src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts',
  )
  const migration = read(
    'scripts/migrations/postgres/1284_tanzania_fiscal_document_id_backfill.sql',
  )

  assert.match(receiptBuilder, /fiscalEventRequest/)
  assert.match(receiptBuilder, /tanzaniaProxyMetadata\?\.receiptVerificationNumber/)
  assert.match(receiptRoute, /latestFiscalEvent\?\.request_payload/)
  assert.match(
    receiptRoute,
    /tanzaniaProxyReceipt\?\.fiscalVerificationCode[\s\S]*tanzaniaProxyMetadata\?\.receiptVerificationNumber/,
  )
  assert.match(receiptRepository, /hasStaleVerificationCode/)
  assert.match(receiptRepository, /predatesFiscalization/)
  assert.match(
    worker,
    /extractProxyDocumentId\(res\.data\)\s*\|\|\s*trimString\(invoice\.documentId\)/,
  )
  assert.doesNotMatch(worker, /docId\s*=.*documentNumber/)
  assert.match(migration, /fe\.status = 'SUCCESS'/)
  assert.match(migration, /fe\.request_payload->>'documentId'/)
  assert.match(migration, /NULLIF\(BTRIM\(t\.fiscal_document_id\), ''\) IS NULL/)
})
