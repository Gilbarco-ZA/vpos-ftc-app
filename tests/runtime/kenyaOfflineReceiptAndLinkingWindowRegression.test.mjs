import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('Kenya pending receipt read materializes canonical offline receipt before normalization', () => {
  const route = read('app/api/receipts/route.ts')
  const payload = read('src/modules/transactions/application/queries/get-receipt-route-data.ts')
  const command = read('src/modules/transactions/application/commands/prepare-receipt-preview.ts')
  assert.match(command, /await isPendingKenyaReceipt\(input\.stationId, input\.transactionId\)/)
  assert.match(route, /await preparePendingKenyaReceipt\(/)
  assert.match(command, /await getOrCreatePreFiscalizationReceipt\(/)
  assert.ok(route.indexOf('await preparePendingKenyaReceipt(') < route.indexOf('const result = await getReceiptRoutePayload('))
  for (const name of ['scuId', 'cuInvoiceNo', 'receiptNumber', 'receiptInternalData', 'receiptSignature', 'fiscalQrCodeData']) {
    assert.match(payload, new RegExp('take\\(saved\\.' + name + '\\)'))
  }
})

test('Kenya proxy refresh only persists an explicitly approved invoice', () => {
  const route = read('app/api/receipts/route.ts')
  assert.match(route, /refreshedStatus === 'APPROVED'/)
  assert.match(route, /if \(refreshedStatus === 'APPROVED'\) \{/)
  assert.match(route, /refreshWarning/)
  assert.match(route, /Kenya proxy status lookup failed/)
})

test('legacy Kenya pending receipt is regenerated when its SCU fields are incomplete', () => {
  const receipt = read('src/modules/transactions/infrastructure/fiscalization/preFiscalizationReceipt.ts')
  assert.match(receipt, /missingOfflineMetadata/)
  assert.match(receipt, /savedCuNumber/)
  assert.match(receipt, /savedSignature/)
  assert.match(receipt, /state\?\.fiscalized_at \|\|/)
})

test('completed pump sales receive the full configured linking window starting at capture', () => {
  const pump = read('src/modules/pumps/infrastructure/transactionHandler.ts')
  const jpl = read('src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts')
  assert.match(pump, /ELSE NOW\(\) \+ \(\$10::int \* INTERVAL '1 second'\)/)
  assert.match(jpl, /ELSE \(NOW\(\) \+ \(\$9::int \* INTERVAL '1 second'\)\) END/)
})

test('scheduler does not bypass a linking deadline just because status is PENDING', () => {
  const queue = read('src/modules/transactions/infrastructure/persistence/transaction-queue.repository.ts')
  const sql = read('src/modules/transactions/infrastructure/persistence/transaction.sql.ts')
  assert.doesNotMatch(queue, /OR status = 'PENDING'\s+OR NOW\(\)/)
  assert.doesNotMatch(sql, /OR status = 'PENDING'\s+OR NOW\(\)/)
  assert.match(queue, /t\.linking_window_expires_at IS NULL/)
  assert.ok(queue.indexOf('const matches =') < queue.indexOf('UPDATE pre_fuel_customer_allocations a'))
})
