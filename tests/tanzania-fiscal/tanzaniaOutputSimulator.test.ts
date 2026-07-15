import test from 'node:test'
import assert from 'node:assert/strict'

import {
  renderTraReceiptOutput,
  renderTraRegistrationUpdateOutput,
  renderTraStatusOutput,
  renderTraZReportOutput,
} from '../../src/modules/tanzania-fiscal/infrastructure/fiscalOutput'
import {
  buildSimulatedEwuraResponse,
  buildSimulatedTraReceiptResponse,
  buildTanzaniaSimulatorSale,
  createTanzaniaFiscalSimulatorFetch,
  createTanzaniaFiscalSimulatorState,
} from '../../src/modules/tanzania-fiscal/infrastructure/fiscalSimulator'

const receiptPayload = {
  receiptNo: 7,
  dailyCount: 3,
  globalCount: 7,
  znum: '20260708',
  receiptVerificationNo: 'SIM7',
  verificationCode: 'SIM7_102030',
  verificationUrl: 'https://virtual.tra.go.tz/efdmsRctVerify/SIM7_102030',
  unsignedXml:
    '<RCT><DATE>2026-07-08</DATE><TIME>10:20:30</TIME><RCTNUM>7</RCTNUM></RCT>',
  xml: '<?xml version="1.0"?><EFDMS><RCT><DATE>2026-07-08</DATE><TIME>10:20:30</TIME></RCT></EFDMS>',
  items: [
    {
      id: '1',
      description: 'Diesel',
      quantity: 12.5,
      taxCode: 'A' as const,
      amount: '50000.00',
      price: 50000,
    },
  ],
  totals: {
    totalExcludingTax: '42372.88',
    totalIncludingTax: '50000.00',
    discount: '0.00',
  },
  payments: [{ type: 'CASH' as const, amount: '50000.00' }],
  vatTotals: [
    {
      vatRate: 'A' as const,
      vatRateText: 'A-18.00',
      nettAmount: '42372.88',
      taxAmount: '7627.12',
      turnover: '50000.00',
    },
  ],
}

test('renders package-compatible TRA receipt text output without a physical printer dependency', () => {
  const rendered = renderTraReceiptOutput({
    payload: receiptPayload,
    station: {
      name: 'Simba Oil',
      tin: '100000001',
      vrn: '40000001A',
      serial: 'SIMTRA001',
      taxOffice: 'Ilala',
    },
    transaction: { pumpNumber: 1, nozzleNumber: 2 },
    customer: { customerName: 'Cash Customer' },
  })

  assert.equal(rendered.kind, 'tra_receipt')
  assert.match(rendered.text, /SIMBA OIL/)
  assert.match(rendered.text, /TRA FISCAL RECEIPT/)
  assert.match(rendered.text, /CUSTOMER NAME: Cash Customer/)
  assert.match(rendered.text, /RECEIPT VERIFICATION CODE/)
  assert.match(rendered.text, /SIM7_102030/)
  assert.equal(rendered.metadata.receiptVerificationNo, 'SIM7')
})

test('renders TRA z-report, registration update, and status change outputs', () => {
  const z = renderTraZReportOutput({
    payload: {
      reportDate: '2026-07-08',
      znum: '20260708',
      reportNo: 20260708,
      unsignedXml: '<ZREPORT><DATE>2026-07-08</DATE><TIME>23:59:59</TIME></ZREPORT>',
      xml: '<EFDMS><ZREPORT /></EFDMS>',
      totals: {
        dailyTotalAmount: '50000.00',
        gross: '90000.00',
        corrections: '0.00',
        discounts: '0.00',
        surcharges: '0.00',
        ticketsVoid: '0',
        ticketsVoidTotal: '0.00',
        ticketsFiscal: '1',
        ticketsNonFiscal: '0',
      },
      payments: [{ type: 'CASH', amount: '50000.00' }],
      vatTotals: receiptPayload.vatTotals,
      changes: { vatChangeNo: 0, headChangeNo: 0 },
    },
  })
  assert.match(z.text, /TRA DAILY Z REPORT/)
  assert.match(z.text, /PAYMENTS REPORT/)

  const registration = renderTraRegistrationUpdateOutput({
    oldRegistration: { tin: '1', serial: 'OLD' },
    newRegistration: { tin: '1', serial: 'NEW' },
    changedAt: '2026-07-08T10:00:00Z',
  })
  assert.match(registration.text, /REGISTRATION CHANGED/)
  assert.match(registration.text, /OLD SERIAL: OLD/)
  assert.match(registration.text, /NEW SERIAL: NEW/)

  const status = renderTraStatusOutput({
    oldStatus: { ackcode: '1', ackmsg: 'OLD' },
    newStatus: { ackcode: '0', ackmsg: 'OK' },
    changedAt: '2026-07-08T10:00:00Z',
  })
  assert.match(status.text, /CONTROL STATUS CHANGE/)
  assert.match(status.text, /NEW ACKCODE:\s+0/)
})

test('creates deterministic Tanzania simulator sales and endpoint responses', async () => {
  const state = createTanzaniaFiscalSimulatorState({
    now: new Date('2026-07-08T08:00:00.000Z'),
    config: { seed: 10, receiptCode: 'SIM' },
  })
  const sale = buildTanzaniaSimulatorSale({
    state,
    now: new Date('2026-07-08T08:01:00.000Z'),
    tankId: '1',
    volume: 10,
  })

  assert.equal(sale.id, '000001')
  assert.equal(sale.total_amount, 32000)
  assert.equal(state.completedTransactions, 1)
  assert.equal(state.tankLevels['1'], 11990)

  const traResponse = buildSimulatedTraReceiptResponse({
    receiptXml: '<RCT><RCTNUM>7</RCTNUM><TIME>10:20:30</TIME></RCT>',
    receiptCode: 'SIM',
  })
  assert.match(traResponse, /<ACKCODE>0<\/ACKCODE>/)
  assert.match(traResponse, /SIM7_102030/)

  const ewuraResponse = buildSimulatedEwuraResponse({
    requestName: 'PostRetailSalesTran',
    transactionId: sale.id,
  })
  assert.match(ewuraResponse, /<Code>200<\/Code>/)
  assert.match(ewuraResponse, /<TranId>000001<\/TranId>/)

  const fetchImpl = createTanzaniaFiscalSimulatorFetch({
    config: { receiptCode: 'SIM' },
  })
  const token = await fetchImpl('https://virtual.tra.go.tz/vfdtoken')
  assert.equal(token.status, 200)
  assert.equal(token.headers.get('ackcode'), '7')

  const receipt = await fetchImpl('https://virtual.tra.go.tz/api/efdmsRctInfo', {
    method: 'POST',
    body: '<RCT><RCTNUM>7</RCTNUM><TIME>10:20:30</TIME></RCT>',
  })
  assert.equal(receipt.status, 200)
  assert.match(await receipt.text(), /SIM7_102030/)
})
