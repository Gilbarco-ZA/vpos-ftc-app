import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/api/receipts/route.ts', 'utf8')
const persistence = readFileSync('src/modules/transactions/application/commands/persist-kenya-receipt-refresh.ts', 'utf8')
const print = readFileSync('src/modules/printing/infrastructure/printJobs.ts', 'utf8')

test('Kenya receipt refresh saves verified results before delivering a new receipt', () => {
  assert.match(route, /persistKenyaReceiptRefresh\(/)
  assert.ok(route.indexOf('await persistKenyaReceiptRefresh(') < route.indexOf('const result = await getReceiptRoutePayload('))
  assert.match(persistence, /status\?\.status !== 'Approved'/)
  assert.match(persistence, /status\?\.documentId !== tx\.fiscal_document_id/)
  assert.match(persistence, /UPDATE receipts SET/)
  assert.match(persistence, /plain_text_content = \$4/)
  assert.match(persistence, /fiscal_data = \$5::jsonb/)
  assert.doesNotMatch(persistence, /UPDATE transactions SET|INSERT INTO fiscalization_events/)
})

test('physical receipt reprint uses saved fiscal snapshot without another network call', () => {
  assert.doesNotMatch(print, /refreshKenyaReceiptStatus/)
  assert.match(print, /const printTextContent = canonicalText/)
  assert.match(print, /extractReceiptQrData\(receipt\?\.fiscal_data\)/)
})
