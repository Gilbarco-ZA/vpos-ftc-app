import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const builder = readFileSync('src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts', 'utf8')

test('pending Kenya receipts allocate numeric CU invoice numbers even with a document ID or QR payload', () => {
  const allocation = builder.slice(builder.indexOf('const kenyaOfflineEligible'), builder.indexOf('const kenyaOffline ='))
  assert.match(allocation, /stationCountry === 'KE'/)
  assert.match(allocation, /!txn\.fiscalized_at/)
  assert.doesNotMatch(allocation, /!txn\.fiscal_document_id/)
  assert.doesNotMatch(allocation, /!templateModel\?\.fiscalQrCodeData/)
  assert.match(allocation, /ensureKenyaOfflineReceiptNumber/)
})
test('pending Kenya CU invoice suffix is numeric and never the R- transaction reference', () => {
  assert.match(builder, /const kenyaNumber = stationCountry === 'KE' && kenyaOfflineEligible/)
  assert.ok(builder.includes(String.raw`/^\d+$/.test(String(kenyaNumber))`))
  assert.match(builder, /Verified Kenya fiscal configuration/)
})
