import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('DOMS transaction price is captured separately and only consumed by Tanzania receipts', () => {
  const values = read('src/modules/forecourt/infrastructure/transactionValues.ts')
  const events = read('src/modules/forecourt/infrastructure/jpl/events.ts')
  const ingest = read(
    'src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts',
  )
  const helper = read('src/modules/tanzania-fiscal/domain/domsUnitPrice.ts')
  const builder = read(
    'src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts',
  )
  const route = read(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
  )
  const kenya = read('src/shared/fiscalization/receipt/templates/KE.ts')

  assert.match(values, /'Price_e'/)
  assert.match(values, /resolveTransactionUnitPrice/)
  assert.match(events, /stationDecimals\.unitPrice/)
  assert.match(events, /unitPrice: Number\.isFinite/)
  assert.match(ingest, /unitPrice,\n\s+occurredAt:/)
  assert.match(helper, /getTanzaniaDomsUnitPrice/)
  assert.match(builder, /stationCountry === 'TZ' \? getTanzaniaDomsUnitPrice\(txn\) : null/)
  assert.match(route, /isTanzania\s*\? getTanzaniaDomsUnitPrice\(transaction\)/)
  assert.doesNotMatch(kenya, /getTanzaniaDomsUnitPrice|domsUnitPrice/)
})

test('Tanzania EWURA uses captured DOMS price with the legacy calculation as fallback', () => {
  const ewura = read('src/modules/tanzania-fiscal/infrastructure/ewura.ts')

  assert.match(ewura, /const domsUnitPrice = getTanzaniaDomsUnitPrice\(transaction\)/)
  assert.match(ewura, /domsUnitPrice != null/)
  assert.match(ewura, /amount \/ volume/)
  assert.match(ewura, /UnitPrice: unitPrice/)
})

test('all transaction receipt printing uses saved printer config and terminal print status', () => {
  const route = read('app/api/receipts/print/route.ts')
  const worker = read('src/modules/printing/infrastructure/printJobs.ts')
  const sql = read('src/modules/printing/infrastructure/printJobs.sql.ts')
  const viewer = read('components/receipts/ReceiptViewerClient.tsx')
  const sheet = read('components/transactions/TransactionReceiptSheet.tsx')
  const client = read('src/shared/receipts/printReceiptClient.ts')
  const template = read('src/shared/fiscalization/receipt/templates/TZ.ts')
  const images = read('src/modules/printing/infrastructure/receiptImages.ts')

  assert.match(route, /printerKey: resolvedPrinter\.deviceKey/)
  assert.doesNotMatch(route, /printerIP: resolvedPrinter\.config\.host/)
  assert.doesNotMatch(route, /port: resolvedPrinter\.config\.port/)
  assert.doesNotMatch(route, /width: resolvedPrinter\.config\.width/)
  assert.match(route, /status === 'DONE'/)
  assert.match(route, /markTransactionReceiptPrinted/)
  assert.match(client, /status === 'DONE'/)
  assert.match(client, /status === 'FAILED'/)
  assert.match(viewer, /printReceiptAndWait/)
  assert.match(viewer, /Receipt printed successfully/)
  assert.match(sheet, /printReceiptAndWait/)
  assert.match(sheet, /Receipt printed successfully/)

  assert.match(sql, /companyTin/)
  assert.match(sql, /station_kv/)
  assert.match(worker, /siteTin: metadata\.siteTin \?\? receipt\?\.station_tin/)
  assert.match(template, /asset: 'tra-receipt-start'/)
  assert.match(template, /asset: 'branding-logo'/)
  assert.match(template, /asset: 'tra-receipt-end'/)
  assert.match(template, /customization\?\.headerLines/)
  assert.match(template, /customization\?\.footerLines/)
  assert.match(images, /TRA_receipt_start\.png/)
  assert.match(images, /TRA_receipt_end\.png/)
  assert.match(images, /logoPath/)
})
