import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

test('Kenya receipt generation uses saved Kenya fiscal PIN first', () => {
  const builder = readFileSync('src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts', 'utf8')
  assert.match(builder, /stationCountry === 'KE'\s*\? pickFirst\(\s*kenyaSite\?\.value\?\.tin,\s*station\?\.pin/)
})

test('Kenya receipt retrieval overrides stale station and receipt PIN with verified config', () => {
  const route = readFileSync('src/modules/transactions/application/queries/get-receipt-route-data.ts', 'utf8')
  const normalize = readFileSync('src/shared/receipts/normalizeReceipt.ts', 'utf8')
  assert.match(route, /kenya\.fiscal\.site\.configuration/)
  assert.match(route, /verifiedKenyaPin,\s*transactionLines:/)
  assert.match(normalize, /companyPin:\s*pickFirst\(\s*verifiedKenyaPin,/)
  assert.match(normalize, /companyTin: pickFirst\(\s*verifiedKenyaPin,/)
})
