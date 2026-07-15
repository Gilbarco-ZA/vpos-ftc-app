import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTanzaniaFiscalDayKey,
  compareEwuraXmlToFiscalTzShape,
  compareTraReceiptXmlToFiscalTzShape,
  compareTraZReportXmlToFiscalTzShape,
  normalizeFiscalXmlForComparison,
  validateTanzaniaReceiptCounterLedger,
  validateTanzaniaZReportBoundary,
} from '../../src/modules/tanzania-fiscal/infrastructure/parityValidation'
import { buildEwuraNpgisPayloadXml } from '../../src/modules/tanzania-fiscal/infrastructure/ewura'
import { buildTraReceiptPayloadString } from '../../src/modules/tanzania-fiscal/infrastructure/traReceipt'
import { buildTraZReportPayloadString } from '../../src/modules/tanzania-fiscal/infrastructure/traZReport'

test('compares FTC TRA receipt XML against the vpos-fiscal-tz receipt shape', () => {
  const receiptBody = buildTraReceiptPayloadString({
    date: '2026-07-08',
    time: '10:15:20',
    znum: '20260708',
    receiptNo: 42,
    dailyCount: 2,
    globalCount: 42,
    receiptVerificationNo: 'ABC12342',
    config: {
      taxIdNo: '123456789',
      vfdRegId: 'TZ0100082639',
      vfdSerialNo: '10TZ107372',
      receiptCode: 'ABC123',
      customerIdType: '6',
      customerId: '987654321',
      customerName: 'Demo Buyer',
      customerMobileNo: '+255700000000',
    },
    items: [
      {
        id: '1',
        description: 'Diesel',
        quantity: 10,
        taxCode: 'A',
        amount: '25000.00',
        price: 25000,
      },
    ],
    totals: {
      totalExcludingTax: '21186.44',
      totalIncludingTax: '25000.00',
      discount: '0.00',
    },
    payments: [{ type: 'CASH', amount: '25000.00' }],
    vatTotals: [
      {
        vatRate: 'A',
        vatRateText: 'A-18.00',
        nettAmount: '21186.44',
        taxAmount: '3813.56',
        turnover: '25000.00',
      },
    ],
  })
  const xml = `<?xml version="1.0"?><EFDMS>${receiptBody}<EFDMSSIGNATURE>SIG</EFDMSSIGNATURE></EFDMS>`

  const validation = compareTraReceiptXmlToFiscalTzShape(xml)

  assert.equal(validation.ok, true)
  assert.ok(validation.presentPaths.includes('EFDMS.RCT.RCTVNUM'))
  assert.match(validation.normalizedXml, /<EFDMSSIGNATURE>__SIGNATURE__<\/EFDMSSIGNATURE>/)
})

test('detects TRA receipt counter mismatches before endpoint submission', () => {
  const receiptBody = buildTraReceiptPayloadString({
    date: '2026-07-08',
    time: '10:15:20',
    znum: '20260708',
    receiptNo: 41,
    dailyCount: 2,
    globalCount: 42,
    receiptVerificationNo: 'ABC12342',
    config: {
      taxIdNo: '123456789',
      vfdRegId: 'TZ0100082639',
      vfdSerialNo: '10TZ107372',
      receiptCode: 'ABC123',
      customerIdType: '6',
    },
    items: [
      {
        id: '1',
        description: 'Diesel',
        quantity: 10,
        taxCode: 'A',
        amount: '25000.00',
        price: 25000,
      },
    ],
    totals: {
      totalExcludingTax: '21186.44',
      totalIncludingTax: '25000.00',
      discount: '0.00',
    },
    payments: [{ type: 'CASH', amount: '25000.00' }],
    vatTotals: [
      {
        vatRate: 'A',
        vatRateText: 'A-18.00',
        nettAmount: '21186.44',
        taxAmount: '3813.56',
        turnover: '25000.00',
      },
    ],
  })

  const validation = compareTraReceiptXmlToFiscalTzShape(
    `<EFDMS>${receiptBody}<EFDMSSIGNATURE>SIG</EFDMSSIGNATURE></EFDMS>`,
  )

  assert.equal(validation.ok, false)
  assert.equal(
    validation.issues.some((item) => item.code === 'rctnum_gc_mismatch'),
    true,
  )
})

test('compares FTC TRA z-report XML against the vpos-fiscal-tz z-report shape', () => {
  const zReportBody = buildTraZReportPayloadString({
    date: '2026-07-08',
    time: '23:59:59',
    header: ['Demo Station', 'PLOT:1', 'TEL NO:+255700000000'],
    config: {
      vatRegNo: '12345678A',
      taxIdNo: '123456789',
      taxOffice: 'Large Taxpayer',
      vfdRegId: 'TZ0100082639',
      vfdSerialNo: '10TZ107372',
      registrationDate: '2026-01-01',
      userIdNo: '09VFDWEBAPI-12345678910TZ107372',
      simIMSI: 'WEBAPI',
    },
    znum: '20260708',
    totals: {
      dailyTotalAmount: '25000.00',
      gross: '100000.00',
      corrections: '0.00',
      discounts: '0.00',
      surcharges: '0.00',
      ticketsVoid: '0',
      ticketsVoidTotal: '0.00',
      ticketsFiscal: '1',
      ticketsNonFiscal: '0',
    },
    payments: [
      { type: 'CASH', amount: '25000.00' },
      { type: 'CHEQUE', amount: '0.00' },
      { type: 'CCARD', amount: '0.00' },
      { type: 'EMONEY', amount: '0.00' },
      { type: 'INVOICE', amount: '0.00' },
    ],
    vatTotals: [
      {
        vatRate: 'A',
        vatRateText: 'A-18.00',
        nettAmount: '21186.44',
        taxAmount: '3813.56',
        turnover: '25000.00',
      },
    ],
    changes: { vatChangeNo: 0, headChangeNo: 0 },
  })
  const validation = compareTraZReportXmlToFiscalTzShape(
    `<EFDMS>${zReportBody}<EFDMSSIGNATURE>SIG</EFDMSSIGNATURE></EFDMS>`,
  )

  assert.equal(validation.ok, true)
  assert.ok(validation.presentPaths.includes('EFDMS.ZREPORT.TOTALS.TICKETSFISCAL'))
})

test('compares FTC EWURA NPGIS XML against official vpos-fiscal-tz payload shapes', () => {
  const sales = buildEwuraNpgisPayloadXml({
    type: 'sales',
    apiSourceId: '109272930_SPTEST2023T',
    signature: 'SIG',
    data: {
      TranId: 10,
      EWURALicenseNo: 'PRL-2021-065',
      RctVerificationCode: 'ABC12342',
      RctDate: '2026-07-08',
      RctTime: '10:15:20',
      OperatorTin: '123456789',
      RetailStationName: 'Demo Station',
      TraSerialNo: '10TZ107372',
      ProductName: 'DIESEL',
      UnitPrice: 2500,
      Volume: 10,
      Amount: 25000,
      DiscountAmount: 0,
      AmountNew: 25000,
    },
  })
  const inventory = buildEwuraNpgisPayloadXml({
    type: 'inventory',
    apiSourceId: '109272930_SPTEST2023T',
    signature: 'SIG',
    data: {
      TranId: 20,
      EWURALicenseNo: 'PRL-2021-065',
      RetailStationName: 'Demo Station',
      SerialNo: '10TZ107372',
      ReportId: '20260708',
      ReportNo: '20260708',
      StartDate: '2026-07-08T00:00:00.0000000+03:00',
      EndDate: '2026-07-08T23:59:59.0000000+03:00',
      CountOfTrasactions: 1,
      TotalAmount: 25000,
      TotalNetAmount: 25000,
      TotalVolume: 10,
      TankInventory: { Tank: [{ TankID: '1', TankProdName: 'DIESEL' }] },
    },
  })

  assert.equal(compareEwuraXmlToFiscalTzShape(sales.xml, 'sales').ok, true)
  assert.equal(compareEwuraXmlToFiscalTzShape(inventory.xml, 'inventory').ok, true)
})

test('validates fiscal counters, fiscal day keys, z-report boundaries, and retry idempotency', () => {
  assert.equal(
    buildTanzaniaFiscalDayKey('2026-07-08T10:30:00.000Z'),
    '20260708',
  )

  const ledger = [
    {
      transactionId: 'tx-1',
      receiptNo: 1,
      globalCount: 1,
      dailyCount: 1,
      znum: '20260708',
    },
    {
      transactionId: 'tx-1',
      receiptNo: 1,
      globalCount: 1,
      dailyCount: 1,
      znum: '20260708',
    },
    {
      transactionId: 'tx-2',
      receiptNo: 2,
      globalCount: 2,
      dailyCount: 2,
      znum: '20260708',
    },
    {
      transactionId: 'tx-3',
      receiptNo: 3,
      globalCount: 3,
      dailyCount: 1,
      znum: '20260709',
    },
  ]

  const validation = validateTanzaniaReceiptCounterLedger(ledger)
  assert.equal(validation.ok, true)
  assert.equal(validation.byZnum['20260708']?.maxDailyCount, 2)

  const boundary = validateTanzaniaZReportBoundary({
    entries: ledger,
    znum: '20260708',
    zReportGlobalCount: 2,
    zReportDailyCount: 2,
  })
  assert.equal(boundary.ok, true)
  assert.equal(boundary.includedReceiptCount, 2)

  const badRetry = validateTanzaniaReceiptCounterLedger([
    ...ledger,
    {
      transactionId: 'tx-2',
      receiptNo: 4,
      globalCount: 4,
      dailyCount: 3,
      znum: '20260708',
    },
  ])
  assert.equal(badRetry.ok, false)
  assert.equal(
    badRetry.issues.some((item) => item.code === 'transaction_counter_reallocated'),
    true,
  )
})

test('normalizes fiscal XML for stable support comparisons', () => {
  const a = '<?xml version="1.0"?><EFDMS><RCT><CUSTID /></RCT><EFDMSSIGNATURE>abc</EFDMSSIGNATURE></EFDMS>'
  const b = '<EFDMS>\n  <RCT><CUSTID></CUSTID></RCT><EFDMSSIGNATURE>def</EFDMSSIGNATURE></EFDMS>'

  assert.equal(
    normalizeFiscalXmlForComparison(a),
    normalizeFiscalXmlForComparison(b),
  )
})
