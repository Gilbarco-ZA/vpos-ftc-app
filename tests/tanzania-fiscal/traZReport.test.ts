import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTraZReportPayloadString,
  resolveTraZReportEndpoint,
  summarizePaymentTypes,
} from '../../src/modules/tanzania-fiscal/infrastructure/traZReport'

test('resolves package-compatible TRA z-report endpoint', () => {
  assert.equal(
    resolveTraZReportEndpoint('https://vfd.tra.go.tz'),
    'https://vfd.tra.go.tz/api/efdmszreport',
  )
  assert.equal(
    resolveTraZReportEndpoint('https://vfd.tra.go.tz/api/efdmsRctInfo'),
    'https://vfd.tra.go.tz/api/efdmszreport',
  )
})

test('builds package-compatible TRA z-report XML payload string', () => {
  const xml = buildTraZReportPayloadString({
    date: '2026-07-08',
    time: '23:59:59',
    header: ['TEST TAXPAYER', 'DAR ES SALAAM,TANZANIA'],
    config: {
      vatRegNo: '12345678A',
      taxIdNo: '222222222',
      taxOffice: 'TEST REGION',
      vfdRegId: 'TZ0100082639',
      vfdSerialNo: '10TZ107372',
      registrationDate: '2019-08-15',
      userIdNo: '09VFDWEBAPI-11111111122222222210TZ107372',
      simIMSI: 'WEBAPI',
    },
    znum: '20260708',
    totals: {
      dailyTotalAmount: '2143250.00',
      gross: '513880841.00',
      corrections: '0.00',
      discounts: '0.00',
      surcharges: '0.00',
      ticketsVoid: '0',
      ticketsVoidTotal: '0.00',
      ticketsFiscal: '36',
      ticketsNonFiscal: '6',
    },
    vatTotals: [
      {
        vatRate: 'A',
        vatRateText: 'A-18.00',
        nettAmount: '1816313.55',
        taxAmount: '326936.45',
        turnover: '2143250.00',
      },
    ],
    payments: [
      { type: 'CASH', amount: '2143250.00' },
      { type: 'CCARD', amount: '0.00' },
    ],
    changes: { vatChangeNo: 0, headChangeNo: 0 },
  })

  assert.match(xml, /<ZREPORT>/)
  assert.match(xml, /<ZNUMBER>20260708<\/ZNUMBER>/)
  assert.match(xml, /<VATRATE>A-18.00<\/VATRATE>/)
  assert.match(xml, /<VATCHANGENUM>0<\/VATCHANGENUM>/)
  assert.match(xml, /<FWVERSION>3.0<\/FWVERSION>/)
})

test('summarizes payment labels through the TRA payment mapping', () => {
  assert.deepEqual(summarizePaymentTypes(['cash', 'card', 'mobile money']), {
    CASH: 1,
    CCARD: 1,
    EMONEY: 1,
  })
})
