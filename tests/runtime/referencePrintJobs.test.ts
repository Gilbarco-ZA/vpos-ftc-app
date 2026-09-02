import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { renderEscpos } from '@/src/shared/printers/escposRenderer'

import {
  buildReferencePrintJobPayload,
  extractEmbeddedPrintable,
  extractPrintPayloadSource,
  formatReportPrintText,
  htmlToPlainText,
  isSpecializedEmbeddedReceiptPayload,
  normalizePrintJobType,
} from '@/src/modules/printing/domain/printJobPayload'
import {
  buildReceiptEscposLines,
  extractReceiptQrData,
  extractReceiptPrintMetadata,
} from '@/src/modules/printing/domain/receiptPrintDocument'

test('legacy print job types normalize to canonical worker types', () => {
  assert.equal(normalizePrintJobType('TRANSACTION_RECEIPT'), 'print.receipt')
  assert.equal(normalizePrintJobType('REPORT'), 'print.report')
  assert.equal(
    normalizePrintJobType('setup.test_report_printout'),
    'setup.test_report_printout',
  )
})

test('reference payload keeps routing metadata and removes printable bodies', () => {
  const compact = buildReferencePrintJobPayload({
    type: 'receipt',
    copies: 2,
    printerKey: 'pump-4',
    printerIP: '10.0.0.44',
    port: 9100,
    width: 42,
    data: {
      source: 'vpos.transaction-receipt',
      transactionId: 'tx-123',
      receiptId: 'receipt-123',
      receiptNumber: 'R-1001',
      htmlContent: '<p>large html</p>',
      plainTextContent: 'large receipt body',
      fiscalData: { response: 'duplicate fiscal response' },
    },
    printable: {
      escposBase64: 'duplicate-printer-bytes',
    },
  })

  assert.deepEqual(compact, {
    schemaVersion: 1,
    storageMode: 'reference',
    copies: 2,
    port: 9100,
    printerIP: '10.0.0.44',
    printerKey: 'pump-4',
    receiptId: 'receipt-123',
    receiptNumber: 'R-1001',
    source: 'vpos.transaction-receipt',
    type: 'receipt',
    width: 42,
  })

  const serialized = JSON.stringify(compact)
  assert.doesNotMatch(serialized, /large html/)
  assert.doesNotMatch(serialized, /large receipt body/)
  assert.doesNotMatch(serialized, /duplicate fiscal response/)
  assert.doesNotMatch(serialized, /duplicate-printer-bytes/)
  assert.ok(Buffer.byteLength(serialized, 'utf8') < 512)
})

test('legacy embedded receipt and credit-note shapes remain readable', () => {
  assert.equal(
    extractPrintPayloadSource({
      data: { source: 'vpos.credit-note-receipt' },
    }),
    'vpos.credit-note-receipt',
  )
  assert.equal(
    isSpecializedEmbeddedReceiptPayload({
      data: { source: 'vpos.credit-note-receipt' },
    }),
    true,
  )
  assert.equal(
    isSpecializedEmbeddedReceiptPayload({
      storageMode: 'reference',
      source: 'vpos.credit-note-receipt',
    }),
    false,
  )
  assert.equal(
    isSpecializedEmbeddedReceiptPayload({
      data: { source: 'vpos.transaction-receipt' },
    }),
    false,
  )
  assert.deepEqual(
    extractEmbeddedPrintable({
      data: { receipt: { plainTextContent: 'CREDIT NOTE\nTOTAL 10.00' } },
    }),
    { kind: 'text', value: 'CREDIT NOTE\nTOTAL 10.00' },
  )
  assert.deepEqual(
    extractEmbeddedPrintable({ printable: { receiptLines: [{ text: 'A' }] } }),
    { kind: 'receiptLines', value: [{ text: 'A' }] },
  )
  assert.deepEqual(
    extractEmbeddedPrintable({ escpos_base64: 'YWJj' }),
    { kind: 'escposBase64', value: 'YWJj' },
  )
})

test('canonical HTML fallback and report formatting produce printable text', () => {
  assert.equal(
    htmlToPlainText('<h1>Receipt</h1><p>Total &amp; Tax</p><br>Done'),
    'Receipt\nTotal & Tax\n\nDone',
  )

  assert.equal(
    formatReportPrintText({
      reportType: 'SHIFT_TOTALS',
      reportDateTime: '2026-07-21T06:00:00.000Z',
      payload: { total: 123.45, count: 8 },
    }),
    [
      'SHIFT_TOTALS',
      'Generated: 2026-07-21T06:00:00.000Z',
      '--------------------------------',
      '{\n  "total": 123.45,\n  "count": 8\n}',
    ].join('\n'),
  )
})

test('canonical receipt text restores a native QR line from its fiscal snapshot', () => {
  const qrData = extractReceiptQrData({
    receipt: {
      fiscalQrCodeData:
        'https://verify.tra.go.tz/4BC37A335741_091435',
    },
  })
  const lines = buildReceiptEscposLines({
    plainText:
      'RECEIPT\n------------------------------------------\n[QR]\n{"fiscal_document_id":"C33ED5B2CE5E","',
    qrData,
  })

  assert.equal(qrData, 'https://verify.tra.go.tz/4BC37A335741_091435')
  assert.deepEqual(lines, [
    { type: 'text', value: 'RECEIPT' },
    { type: 'separator' },
    {
      type: 'qr',
      value: 'https://verify.tra.go.tz/4BC37A335741_091435',
    },
  ])
})

test('Tanzania receipt reconstruction restores legal images and print styling', () => {
  const metadata = extractReceiptPrintMetadata({
    receipt: {
      country: 'TZ',
      companyName: 'Dar Station',
      companyTin: '123456789',
    },
  })
  const lines = buildReceiptEscposLines({
    plainText: [
      'Dar Station',
      'CUSTOMER ID TYPE: 1',
      'CUSTOMER ID: 139867823',
      'CUSTOMER NAME: Mhina Charles Mhina',
    ].join('\n'),
    country: metadata.country,
    siteNames: [metadata.siteName],
    siteTin: metadata.siteTin,
    includeBrandLogo: true,
    width: 42,
  })

  assert.deepEqual(lines[0], { type: 'image', asset: 'tra-receipt-start' })
  assert.deepEqual(lines[1], { type: 'image', asset: 'branding-logo' })
  assert.deepEqual(lines[2], {
    type: 'text',
    value: 'Dar Station',
    align: 'center',
    bold: true,
  })
  assert.deepEqual(lines[3], {
    type: 'text',
    value: 'TIN: 123456789',
    align: 'center',
  })
  const customerNameLine = lines.find(
    (line) =>
      line.type === 'text' && line.value.startsWith('CUSTOMER NAME:'),
  )
  assert.ok(customerNameLine?.type === 'text')
  assert.match(
    customerNameLine.value,
    /^CUSTOMER NAME:\s+Mhina Charles Mhina$/,
  )
  assert.deepEqual(lines.at(-1), {
    type: 'image',
    asset: 'tra-receipt-end',
  })
})

test('ESC POS renderer emits a raster image command', () => {
  const output = renderEscpos([
    {
      type: 'image',
      asset: 'tra-receipt-start',
      width: 8,
      height: 1,
      dataBase64: Buffer.from([0x80]).toString('base64'),
    },
  ])

  assert.notEqual(output.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00])), -1)
  assert.notEqual(output.indexOf(Buffer.from([0x80])), -1)
})

test('print persistence claims both references and writers avoid duplicate receipt bodies', () => {
  const sql = readFileSync(
    'src/modules/printing/infrastructure/printJobs.sql.ts',
    'utf8',
  )
  const queue = readFileSync(
    'src/modules/printing/infrastructure/printQueue.ts',
    'utf8',
  )
  const fiscalization = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts',
    'utf8',
  )
  const receiptRoute = readFileSync('app/api/receipts/print/route.ts', 'utf8')
  const worker = readFileSync(
    'src/modules/printing/infrastructure/printJobs.ts',
    'utf8',
  )

  assert.match(sql, /source_transaction_id, source_report_id/)
  assert.match(sql, /selectReceiptPrintSource/)
  assert.match(sql, /OR r\.id = CASE/)
  assert.match(sql, /THEN BTRIM\(CAST\(\$3 AS text\)\)::uuid/)
  assert.match(sql, /selectReportPrintSource/)
  assert.match(queue, /payloadMode\?: 'embedded' \| 'reference'/)
  assert.match(queue, /buildReferencePrintJobPayload/)
  assert.match(fiscalization, /buildReferencePrintJobPayload/)
  assert.match(fiscalization, /getOrCreateLatestTransactionReceiptRepo/)
  assert.doesNotMatch(fiscalization, /data:\s*receiptPayload/)
  assert.match(worker, /specializedEmbeddedSource/)
  assert.match(worker, /Never replace those with the ordinary transaction/)

  const printPayloadBlock = receiptRoute.match(
    /const printPayload = \{[\s\S]*?\n    \}\n\n    const printResult/,
  )?.[0]
  assert.ok(printPayloadBlock)
  assert.doesNotMatch(printPayloadBlock, /htmlContent/)
  assert.doesNotMatch(printPayloadBlock, /plainTextContent/)
})

test('migration compacts only pending jobs with verified canonical sources', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1256_reference_based_print_jobs.sql',
    'utf8',
  )

  assert.match(migration, /job_type = 'print\.receipt'/)
  assert.match(migration, /job_type = 'print\.report'/)
  assert.match(migration, /pj\.status = 'PENDING'/)
  assert.match(migration, /FROM receipts AS receipt/)
  assert.match(
    migration,
    /IN \('vpos\.transaction-receipt', 'vpos\.auto-print-receipt'\)/,
  )
  assert.match(migration, /receipt\.id::text = COALESCE/)
  assert.match(migration, /'printerIP', COALESCE/)
  assert.match(migration, /'printer_key', COALESCE/)
  assert.doesNotMatch(migration, /COALESCE\(pj\.payload, '\{\}'::jsonb\) - ARRAY/)
  assert.match(migration, /FROM reports AS report/)
  assert.match(migration, /status <> 'PROCESSING'/)
  assert.doesNotMatch(migration, /status = 'PROCESSING'/)
  assert.doesNotMatch(migration, /DELETE FROM print_jobs/)
})
