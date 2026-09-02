import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  RECEIPT_RENDER_VERSION,
  renderReceiptHtmlFromPlainText,
  resolveReceiptContent,
  resolveReceiptRowContent,
} from '@/src/shared/receipts/receiptContent'
import { normalizeReceipt } from '@/src/shared/receipts/normalizeReceipt'
import {
  buildReceiptBrandingSnapshot,
  buildReceiptFiscalSnapshot,
  normalizeReceiptBrandingSnapshot,
} from '@/src/shared/receipts/receiptSnapshots'

test('legacy stored HTML remains unchanged during compatibility reads', () => {
  const legacyHtml = '  <!doctype html><html><body><p>Legacy &amp; exact</p></body></html>\n'
  const resolved = resolveReceiptContent({
    htmlContent: legacyHtml,
    plainTextContent: null,
  })

  assert.equal(resolved.htmlContent, legacyHtml)
  assert.equal(resolved.plainTextContent, 'Legacy & exact')
  assert.equal(resolved.htmlSource, 'stored')
  assert.equal(resolved.renderVersion, RECEIPT_RENDER_VERSION)
})

test('plain-text-only receipts generate deterministic escaped HTML', () => {
  const plainText = 'STEIN & Sons\nTotal < 100\n  aligned'
  const resolved = resolveReceiptContent({
    plainTextContent: plainText,
    htmlContent: null,
    renderVersion: RECEIPT_RENDER_VERSION,
  })

  assert.equal(resolved.plainTextContent, plainText)
  assert.equal(resolved.htmlSource, 'generated')
  assert.equal(
    resolved.htmlContent,
    renderReceiptHtmlFromPlainText(plainText, RECEIPT_RENDER_VERSION),
  )
  assert.match(resolved.htmlContent ?? '', /STEIN &amp; Sons/)
  assert.match(resolved.htmlContent ?? '', /Total &lt; 100/)
  assert.match(resolved.htmlContent ?? '', /\n  aligned/)
})

test('receipt row resolver preserves snake-case API compatibility', () => {
  const row = resolveReceiptRowContent({
    id: 'receipt-1',
    plain_text_content: 'Receipt body',
    html_content: null,
    render_version: 1,
  })

  assert.equal(row.id, 'receipt-1')
  assert.equal(row.plain_text_content, 'Receipt body')
  assert.match(row.html_content ?? '', /<pre[^>]*>Receipt body<\/pre>/)
  assert.equal(row.render_version, 1)
})

test('unknown receipt renderer versions fail closed', () => {
  assert.throws(
    () => renderReceiptHtmlFromPlainText('Receipt', 99),
    /Unsupported receipt render version: 99/,
  )
})

test('fiscal and branding snapshots use explicit bounded schemas', () => {
  const fiscal = buildReceiptFiscalSnapshot({
    model: {
      station: {
        name: 'Station',
        taxId: 'TIN-1',
        country: 'TZ',
        mobile: '0123',
        vrn: 'VRN-1',
        serial: 'SERIAL-1',
        uin: 'UIN-1',
        taxOffice: 'Tax office',
      },
      transaction: {
        date: '2026-07-21',
        invoiceNo: 'INV-1',
        fiscalReference: 'FISCAL-1',
        receiptDate: '2026-07-21',
        receiptTime: '10:30:00',
      },
      customer: { name: 'Customer', tin: 'BUYER-TIN' },
      items: [
        {
          name: 'Fuel',
          taxCode: 'A',
          quantity: 40,
          unitPrice: 2,
          amount: 80,
        },
      ],
      taxSummary: [
        {
          taxCode: 'A',
          label: 'VAT',
          rate: 18,
          taxableAmount: 67.8,
          taxAmount: 12.2,
        },
      ],
      payment: { method: 'CASH', amount: 80, itemsCount: 1 },
      fiscalMeta: {
        receiptNumber: 'R-1',
        zNumber: 'Z-1',
        verificationCode: 'VERIFY-1',
        verificationUrl: 'https://verify.example/R-1',
      },
      qrPayload: { data: 'https://verify.example/R-1' },
      decimals: { money: 2, volume: 2, unitPrice: 2 },
    },
  })
  const branding = buildReceiptBrandingSnapshot({
    primaryColor: '#111111',
    stationDisplayName: 'Station display',
    logoPath: '/logo.png',
    ignoredLargePayload: 'not accepted',
  } as any)

  const fiscalJson = JSON.stringify(fiscal)
  assert.match(fiscalJson, /"schemaVersion":1/)
  assert.match(fiscalJson, /"receiptNumber":"R-1"/)
  assert.doesNotMatch(fiscalJson, /"items"/)
  assert.doesNotMatch(fiscalJson, /"taxSummary"/)
  assert.doesNotMatch(fiscalJson, /"customer"/)
  assert.doesNotMatch(fiscalJson, /BUYER-TIN/)
  assert.ok(Buffer.byteLength(fiscalJson, 'utf8') < 2048)
  assert.ok(Buffer.byteLength(JSON.stringify(branding), 'utf8') < 512)
  assert.deepEqual(Object.keys(branding).sort(), [
    'logoPath',
    'primaryColor',
    'receiptFooterText',
    'receiptHeaderText',
    'schemaVersion',
    'secondaryColor',
    'stationDisplayName',
  ])
  assert.equal(normalizeReceiptBrandingSnapshot('{}'), null)
  assert.equal(
    normalizeReceiptBrandingSnapshot(
      JSON.stringify({ station_display_name: 'Legacy station name' }),
    )?.stationDisplayName,
    'Legacy station name',
  )

  const normalized = normalizeReceipt({
    transaction: {
      id: 'transaction-1',
      station_id: 'station-1',
      status: 'FISCALIZED',
      fiscalization_reference: 'FISCAL-1',
      transaction_date_time: '2026-07-21T10:30:00.000Z',
      total_amount: 80,
      volume: 40,
      fuel_type: 'Fuel',
    },
    station: { name: 'Station', country: 'TZ' },
    stationName: 'Station',
    transactionLines: [
      {
        product_name: 'Fuel',
        quantity: 40,
        unit_price: 2,
        line_total: 80,
      },
    ],
    raw: fiscal,
    branding,
  })

  assert.equal(normalized?.meta.receiptNumber, 'R-1')
  assert.equal(normalized?.meta.receiptZNumber, 'Z-1')
  assert.equal(normalized?.footer.fiscalVerificationCode, 'VERIFY-1')
  assert.equal(normalized?.header.companyTin, 'TIN-1')
  assert.equal(normalized?.header.country, 'TZ')
  assert.equal(normalized?.branding?.stationDisplayName, 'Station display')
})

test('new receipt writers persist NULL HTML and a renderer version', () => {
  const fiscalizationRepository = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts',
    'utf8',
  )
  const readRepository = readFileSync(
    'src/modules/transactions/infrastructure/persistence/transaction-read.repository.ts',
    'utf8',
  )
  const generator = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/receiptGenerator.ts',
    'utf8',
  )

  for (const source of [fiscalizationRepository, readRepository]) {
    assert.match(source, /html_content, plain_text_content/)
    assert.match(source, /render_version/)
    assert.match(source, /VALUES \([^\n]*NULL/)
    assert.doesNotMatch(source, /receiptPayload\.htmlContent/)
  }
  assert.doesNotMatch(generator, /htmlContent/)
  assert.match(generator, /buildReceiptFiscalSnapshot/)
  assert.match(generator, /buildReceiptBrandingSnapshot/)
})

test('PostgreSQL migration preserves legacy HTML compatibility', () => {
  const postgres = readFileSync(
    'scripts/migrations/postgres/1257_plain_text_receipt_canonical.sql',
    'utf8',
  )
  assert.match(postgres, /ALTER COLUMN html_content DROP NOT NULL/)
  assert.match(postgres, /render_version SMALLINT NOT NULL DEFAULT 1/)
  assert.match(postgres, /receipts_printable_content_check/)
  assert.doesNotMatch(postgres, /UPDATE receipts[\s\S]*html_content/i)

})

test('receipt reads generate HTML from canonical stored content', () => {
  const receiptRoute = readFileSync('app/api/receipts/route.ts', 'utf8')
  const receiptQuery = readFileSync(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
    'utf8',
  )
  const transactionRoute = readFileSync(
    'app/api/transactions/[id]/receipt/route.ts',
    'utf8',
  )
  assert.match(receiptRoute, /getReceiptRoutePayload/)
  assert.match(receiptQuery, /resolveReceiptContent/)
  assert.match(receiptQuery, /resolveReceiptRowContent/)
  assert.match(receiptQuery, /presentation/)
  assert.match(transactionRoute, /getTransactionReceipt/)
  assert.doesNotMatch(transactionRoute, /getOrCreateLatestTransactionReceipt/)
})

test('Tanzania receipt normalization repairs invalid zero net totals from fiscal data', () => {
  const taxable = normalizeReceipt({
    transaction: {
      id: 'transaction-taxable',
      station_id: 'station-1',
      status: 'FISCALIZED',
      fiscalization_reference: 'FISCAL-TAXABLE',
      transaction_date_time: '2026-09-01T06:22:33.000Z',
      total_amount: 118,
      volume: 2,
      fuel_type: 'Petrol',
    },
    station: { name: 'Station', country: 'TZ' },
    stationName: 'Station',
    transactionLines: [
      {
        product_name: 'Petrol',
        quantity: 2,
        unit_price: 59,
        line_total: 118,
        tax_code: 'A',
        tax_rate: 18,
      },
    ],
    raw: {
      success: true,
      totals: { amount: 118, tax: 0, net: 0 },
    },
  })

  assert.equal(taxable?.totals.amount, 118)
  assert.equal(taxable?.totals.tax, 18)
  assert.equal(taxable?.totals.net, 100)

  const exempt = normalizeReceipt({
    transaction: {
      id: 'transaction-exempt',
      station_id: 'station-1',
      status: 'FISCALIZED',
      fiscalization_reference: 'FISCAL-EXEMPT',
      transaction_date_time: '2026-09-01T06:22:35.000Z',
      total_amount: 41,
      volume: 2,
      fuel_type: 'Diesel',
    },
    station: { name: 'Station', country: 'TZ' },
    stationName: 'Station',
    transactionLines: [
      {
        product_name: 'Diesel',
        quantity: 2,
        unit_price: 20.5,
        line_total: 41,
        tax_code: 'E',
        tax_rate: 0,
      },
    ],
    raw: {
      success: true,
      totals: { amount: 41, tax: 0, net: 0 },
    },
  })

  assert.equal(exempt?.totals.amount, 41)
  assert.equal(exempt?.totals.tax, 0)
  assert.equal(exempt?.totals.net, 41)
})
