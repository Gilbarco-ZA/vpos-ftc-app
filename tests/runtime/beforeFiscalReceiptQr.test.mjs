import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('before-fiscalization printing includes unallocated transactions and preview materializes QR identity', () => {
  const worker = read(
    'src/modules/transactions/infrastructure/fiscalization/offlineReceiptPrintWorker.ts',
  )
  const route = read('app/api/receipts/route.ts')
  const previewCommand = read(
    'src/modules/transactions/application/commands/prepare-receipt-preview.ts',
  )
  const preFiscalReceipt = read(
    'src/modules/transactions/infrastructure/fiscalization/preFiscalizationReceipt.ts',
  )

  assert.match(worker, /ss\.print_receipt_order = 'before_fiscalization'/)
  assert.match(worker, /t\.status IN \('OPEN', 'ALLOCATED', 'PENDING', 'FAILED'\)/)
  assert.doesNotMatch(worker, /t\.customer_id IS NOT NULL/)
  assert.doesNotMatch(worker, /ss\.tin_capture_order <> 'before_transaction'/)

  assert.match(route, /prepareReceiptPreview/)
  assert.doesNotMatch(route, /src\/platform\/db\/postgres/)
  assert.doesNotMatch(route, /\/infrastructure\//)

  assert.match(previewCommand, /previewMode/)
  assert.match(previewCommand, /getOrCreatePreFiscalizationReceipt/)
  assert.doesNotMatch(previewCommand, /print_receipt_order/)

  assert.match(preFiscalReceipt, /ensureTanzaniaPreFiscalizationReceiptAssignment/)
  assert.match(preFiscalReceipt, /verificationCode: assignment\.receipt_verification_number/)
  assert.match(preFiscalReceipt, /qrPayload:\s*\{/)
  assert.match(preFiscalReceipt, /data: verificationUrl/)
})

test('non-fiscalized preview reads the materialized fiscal snapshot for full receipt rendering', () => {
  const receiptQuery = read(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
  )
  const sheet = read('components/transactions/TransactionReceiptSheet.tsx')
  const tanzaniaReceipt = read('components/receipts/TanzaniaReceipt80mm.tsx')

  assert.match(receiptQuery, /storedReceipt\?\.fiscal_data/)
  assert.match(receiptQuery, /normalizeReceiptBrandingSnapshot/)
  assert.match(sheet, /previewMode/)
  assert.match(sheet, /<Receipt80mm receipt=\{receipt\}/)
  assert.match(tanzaniaReceipt, /receipt\.footer\.fiscalQrCodeData/)
  assert.match(tanzaniaReceipt, /TRA_receipt_start\.png/)
  assert.match(tanzaniaReceipt, /receiptHeaderText/)
  assert.match(tanzaniaReceipt, /receiptFooterText/)
})
