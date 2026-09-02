import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('Tanzania proxy receipt QR data is a TRA verification URL', () => {
  const builder = read(
    'src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts',
  )
  const receiptRepository = read(
    'src/modules/transactions/infrastructure/persistence/transaction-read.repository.ts',
  )
  const route = read(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
  )
  const mapper = read('src/shared/receipts/mapFiscalReceipt.ts')
  const verification = read(
    'src/modules/tanzania-fiscal/domain/receiptVerificationPrefix.ts',
  )

  assert.match(builder, /buildTanzaniaReceiptVerificationUrl/)
  assert.match(builder, /templateModel\?\.fiscalQrCodeData/)
  assert.match(route, /tanzaniaProxyReceipt\?\.fiscalQrCodeData/)
  assert.match(route, /receipt\.footer\.fiscalQrCodeData/)
  assert.match(receiptRepository, /hasStaleQrData/)
  assert.match(receiptRepository, /expectedProxyQrData/)
  assert.match(receiptRepository, /proxyReceipt\?\.fiscalQrCodeData/)
  assert.match(mapper, /receipt\?\.FiscalQrCodeData/)
  assert.match(mapper, /raw\?\.Details/)
  assert.match(verification, /https:\/\/verify\.tra\.go\.tz\//)
  assert.match(
    verification,
    /https:\/\/virtual\.tra\.go\.tz\/efdmsRctVerify\//,
  )
})

test('receipt printing renders stored QR metadata as an ESC POS QR command', () => {
  const worker = read('src/modules/printing/infrastructure/printJobs.ts')
  const sql = read('src/modules/printing/infrastructure/printJobs.sql.ts')
  const builder = read(
    'src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts',
  )
  const template = read('src/shared/fiscalization/receipt/templates/TZ.ts')
  const imageResolver = read(
    'src/modules/printing/infrastructure/receiptImages.ts',
  )

  assert.match(sql, /r\.html_content, r\.fiscal_data/)
  assert.match(worker, /extractReceiptQrData\(receipt\?\.fiscal_data\)/)
  assert.match(worker, /buildReceiptEscposLines/)
  assert.match(worker, /resolveReceiptEscposImages/)
  assert.match(worker, /renderEscpos\(printableLines/)
  assert.match(template, /asset: 'tra-receipt-start'/)
  assert.match(template, /asset: 'branding-logo'/)
  assert.match(template, /asset: 'tra-receipt-end'/)
  assert.match(imageResolver, /rasterizePngForEscpos/)
  assert.doesNotMatch(builder, /line\.value\.slice\(0, width\)/)
})
