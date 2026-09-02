import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  FiscalReceiptModel,
  PrintableLine,
} from '../../src/shared/fiscalization/receipt/types'
import { buildReceiptLines } from '../../src/shared/fiscalization/receipt/templates/TZ'

const textValues = (model: FiscalReceiptModel) =>
  buildReceiptLines(model)
    .filter(
      (
        line,
      ): line is Extract<PrintableLine, { type: 'text' }> =>
        line.type === 'text',
    )
    .map((line) => line.value)
    .join('\n')

test('Tanzania receipt template follows the production TRA receipt structure', () => {
  const model: FiscalReceiptModel = {
    station: {
      name: 'VPOS Dar Station',
      country: 'TZ',
      mobile: '255700000000',
      taxId: '123456789',
      vrn: '40-123456-A',
      serial: 'VFD-001',
      uin: 'UIN-001',
      taxOffice: 'Ilala',
    },
    transaction: {
      date: '2026-07-15 08:00:00',
      invoiceNo: 'INV-1',
      fiscalReference: 'VER-001',
      receiptDate: '2026-07-15',
      receiptTime: '08:00:00',
      pumpNumber: '2',
      nozzleNumber: '1',
    },
    customer: {
      name: 'Walk-in Customer',
      tin: 'N/A',
    },
    items: [
      {
        name: 'Unleaded Petrol',
        taxCode: 'A',
        quantity: 10,
        unitPrice: 3000,
        amount: 30000,
      },
    ],
    taxSummary: [
      {
        taxCode: 'A',
        label: 'VAT',
        rate: 18,
        taxableAmount: 25423.73,
        taxAmount: 4576.27,
      },
    ],
    payment: {
      method: 'Cash',
      amount: 30000,
      discount: 0,
      itemsCount: 1,
      currency: 'TZS',
    },
    fiscalMeta: {
      receiptNumber: '44',
      traReceiptNumber: '44',
      globalCount: '2702',
      dailyCount: '1',
      zNumber: '20260715',
      verificationCode: 'ABCDEF123',
      verificationUrl: 'https://verify.example/ABCDEF123',
    },
    qrPayload: { data: 'https://verify.example/ABCDEF123' },
    customization: {
      headerLines: ['Thank you for choosing us'],
      footerLines: ['Drive safely'],
    },
    decimals: { money: 2, volume: 2, unitPrice: 2 },
  }

  const lines = buildReceiptLines(model)
  const text = textValues(model)
  assert.deepEqual(lines[0], { type: 'image', asset: 'tra-receipt-start' })
  assert.deepEqual(lines.at(-1), {
    type: 'image',
    asset: 'tra-receipt-end',
  })
  assert.deepEqual(
    lines.find(
      (line) => line.type === 'text' && line.value === 'VPOS Dar Station',
    ),
    {
      type: 'text',
      value: 'VPOS Dar Station',
      align: 'center',
      bold: true,
    },
  )
  assert.match(text, /TIN: 123456789/)
  assert.match(text, /MOBILE: 255700000000/)
  assert.match(text, /SERIAL NO: VFD-001/)
  assert.match(text, /RECEIPT NUMBER:\s+44/)
  assert.match(text, /Z NUMBER:\s+20260715/)
  assert.match(text, /PUMP: 2 \| NOZZLE: 1/)
  assert.match(text, /TOTAL EXCL TAX:/)
  assert.match(text, /TOTAL INCL TAX:/)
  assert.match(text, /PAYMENT METHOD:\s+Cash/)
  assert.match(text, /RECEIPT VERIFICATION CODE/)
  assert.match(text, /Thank you for choosing us/)
  assert.match(text, /Drive safely/)
})


test('Tanzania receipt renders the vpos-console customer identification block', () => {
  const model: FiscalReceiptModel = {
    station: { name: 'VPOS Dar Station', country: 'TZ' },
    transaction: {
      date: '2026-07-15 08:00:00',
      invoiceNo: 'INV-2',
      fiscalReference: 'VER-002',
    },
    customer: {
      name: 'Sample Customer',
      tin: '123456789',
      buyerType: '6',
    },
    items: [],
    taxSummary: [],
    payment: {
      method: 'Cash',
      amount: 0,
      discount: 0,
      itemsCount: 0,
      currency: 'TZS',
    },
    fiscalMeta: { receiptNumber: '45' },
    qrPayload: null,
    decimals: { money: 2, volume: 2, unitPrice: 2 },
  }

  const text = textValues(model)
  assert.match(text, /CUSTOMER ID TYPE:\s+1/)
  assert.match(text, /CUSTOMER ID:\s+123456789/)
  assert.match(text, /CUSTOMER NAME:\s+Sample Customer/)
})
