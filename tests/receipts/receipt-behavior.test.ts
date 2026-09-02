import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptGenerator'
import { mapFiscalReceipt } from '@/src/shared/receipts/mapFiscalReceipt'
import { normalizeReceipt } from '@/src/shared/receipts/normalize'

const fiscalModel = {
  station: {
    name: 'Central Fuel',
    taxId: 'TIN-1',
    country: 'TZ',
    mobile: '+255700000000',
    vrn: 'VRN-1',
    serial: 'SERIAL-1',
    uin: 'UIN-1',
    taxOffice: 'Dar es Salaam',
  },
  transaction: {
    date: '2026-07-21T10:00:00.000Z',
    invoiceNo: 'INV-1',
    fiscalReference: 'FISCAL-REF',
    receiptDate: '2026-07-21',
    receiptTime: '10:00:00',
  },
  customer: { name: 'Cash Customer', tin: '' },
  items: [],
  taxSummary: [],
  payment: { method: 'CASH', amount: 100, itemsCount: 1 },
  fiscalMeta: {
    receiptNumber: 'SCU/123',
    zNumber: '9',
    verificationCode: 'VERIFY-1',
    verificationUrl: 'https://verify.example/1',
  },
  qrPayload: { data: 'QR-DATA' },
  decimals: { money: 2, volume: 2, unitPrice: 2 },
} as const

describe('receipt generation', () => {
  it('builds canonical receipt output through injected dependencies', async () => {
    const calls: unknown[] = []
    const result = await generateReceipt(
      { stationId: 'station-1', transactionId: 'transaction-1' },
      {
        loadBranding: async (stationId) => {
          calls.push(['branding', stationId])
          return {
            primary_color: ' #112233 ',
            secondary_color: '#445566',
            station_display_name: 'Central Fuel',
            receipt_header_text: 'Welcome',
            receipt_footer_text: 'Thank you',
            logo_path: '/branding/logo.png',
          }
        },
        buildReceipt: async (input) => {
          calls.push(['receipt', input])
          return {
            receiptNumber: 'SCU/123',
            text: 'CENTRAL FUEL\nTOTAL 100.00',
            lines: [{ type: 'text', value: 'CENTRAL FUEL' }],
            model: fiscalModel,
          } as any
        },
        renderReceipt: (lines, options) => {
          calls.push(['render', lines, options])
          return Buffer.from('ESC/POS')
        },
      },
    )

    assert.deepEqual(calls[0], ['branding', 'station-1'])
    assert.deepEqual(calls[1], [
      'receipt',
      { stationId: 'station-1', transactionId: 'transaction-1' },
    ])
    assert.equal(result.receiptNumber, 'SCU/123')
    assert.equal(result.plainTextContent, 'CENTRAL FUEL\nTOTAL 100.00')
    assert.equal(result.escposBase64, Buffer.from('ESC/POS').toString('base64'))
    assert.equal(result.fiscalData.reference, 'FISCAL-REF')
    assert.equal(result.fiscalData.receipt.fiscalQrCodeData, 'QR-DATA')
    assert.deepEqual(result.brandingSnapshot, {
      schemaVersion: 1,
      primaryColor: '#112233',
      secondaryColor: '#445566',
      stationDisplayName: 'Central Fuel',
      receiptHeaderText: 'Welcome',
      receiptFooterText: 'Thank you',
      logoPath: '/api/branding/logo.png',
    })
  })

  it('omits branding when the station has no branding row', async () => {
    const result = await generateReceipt(
      { stationId: 'station-1', transactionId: 'transaction-1' },
      {
        loadBranding: async () => null,
        buildReceipt: async () =>
          ({
            receiptNumber: 'SCU/123',
            text: 'receipt',
            lines: [],
            model: fiscalModel,
          }) as any,
        renderReceipt: () => Buffer.alloc(0),
      },
    )

    assert.equal(result.brandingSnapshot, undefined)
    assert.equal(result.escposBase64, '')
  })
})

describe('fiscal receipt mapping', () => {
  it('maps nested string responses and field aliases', () => {
    const mapped = mapFiscalReceipt(
      JSON.stringify({
        data: {
          details: {
            document_number: ' DOC-7 ',
            document_type: 'SALE',
            is_online: true,
            receipt: {
              station_name: ' Central Fuel ',
              company_tin: 'TIN-1',
              receipt_number: 'R-7',
              receipt_date: '2026-07-21',
              receipt_time: '10:00:00',
              verification_code: 'VC-7',
              qr_code: 'QR-7',
            },
          },
        },
      }),
    )

    assert.equal(mapped?.documentNumber, 'DOC-7')
    assert.equal(mapped?.documentType, 'SALE')
    assert.equal(mapped?.isOnline, 'true')
    assert.equal(mapped?.companyName, 'Central Fuel')
    assert.equal(mapped?.companyTin, 'TIN-1')
    assert.equal(mapped?.receiptNumber, 'R-7')
    assert.equal(mapped?.fiscalVerificationCode, 'VC-7')
    assert.equal(mapped?.fiscalQrCodeData, 'QR-7')
  })

  it('maps the Tanzania proxy response casing and preserves FiscalQrCodeData', () => {
    const mapped = mapFiscalReceipt({
      ResponseCode: '200',
      Message: 'Invoice processed successfully',
      Error: false,
      Details: {
        IsOnline: true,
        IsFiscalized: true,
        DocumentType: 'Invoice',
        DocumentNumber: 'INV-2026/09/02-01',
        Receipt: {
          ReceiptNumber: '335741',
          ReceiptZNumber: '20260902',
          ReceiptDate: '2026-09-02',
          ReceiptTime: '10:48:58',
          FiscalVerificationCode: 'F1D845335741',
          FiscalQrCodeData:
            'https://verify.tra.go.tz/F1D845335741_104858',
        },
      },
    })

    assert.equal(mapped?.isOnline, 'true')
    assert.equal(mapped?.isFiscalized, 'true')
    assert.equal(mapped?.documentType, 'Invoice')
    assert.equal(mapped?.documentNumber, 'INV-2026/09/02-01')
    assert.equal(mapped?.receiptNumber, '335741')
    assert.equal(mapped?.receiptZNumber, '20260902')
    assert.equal(mapped?.receiptDate, '2026-09-02')
    assert.equal(mapped?.receiptTime, '10:48:58')
    assert.equal(mapped?.fiscalVerificationCode, 'F1D845335741')
    assert.equal(
      mapped?.fiscalQrCodeData,
      'https://verify.tra.go.tz/F1D845335741_104858',
    )
  })

  it('accepts inline receipt fields in details and rejects empty input', () => {
    assert.deepEqual(
      mapFiscalReceipt({
        response: {
          details: {
            receiptNumber: 'INLINE-1',
            receiptInternalData: 'INTERNAL',
            receiptSignature: 'SIGNATURE',
          },
        },
      }),
      {
        documentId: null,
        documentNumber: null,
        documentType: null,
        isOnline: null,
        isFiscalized: null,
        companyName: null,
        companyMobile: null,
        companyTin: null,
        companyVrn: null,
        companySerial: null,
        companyTaxOffice: null,
        receiptNumber: 'INLINE-1',
        receiptZNumber: null,
        receiptDate: null,
        receiptTime: null,
        receiptInternalData: 'INTERNAL',
        receiptSignature: 'SIGNATURE',
        fiscalVerificationCode: null,
        fiscalQrCodeData: null,
      },
    )
    assert.equal(mapFiscalReceipt(null), null)
    assert.equal(mapFiscalReceipt('{not-json'), null)
    assert.equal(mapFiscalReceipt({ details: {} }), null)
  })
})

describe('legacy receipt normalization', () => {
  it('prefers normalized database lines and transaction identifiers', () => {
    const receipt = normalizeReceipt({
      transaction: {
        fiscalization_reference: 'FISCAL-1',
        pos_reference: 'POS-1',
        cloud_transaction_id: 'CLOUD-1',
        transaction_date_time: '2026-07-21T10:00:00Z',
        total_amount: '100.50',
      },
      customer: { buyer_name: 'Buyer Name' },
      transactionLines: [
        {
          product_name: 'Diesel',
          quantity: '10',
          unit_price: '10.05',
          line_total: '100.50',
        },
      ],
      raw: {
        receipt: {
          totals: { subtotal: '87.39', tax: '13.11', total: '100.50' },
          payment: [{ paymentMethod: 'CARD', paymentReference: 'AUTH-1' }],
          qrCode: { value: 'QR', link: 'https://verify.example' },
        },
      },
    })

    assert.equal(receipt.header.name, 'Buyer Name')
    assert.deepEqual(receipt.identifiers, {
      fiscalizationReference: 'FISCAL-1',
      posReference: 'POS-1',
      cloudTransactionId: 'CLOUD-1',
      transactionDateTime: '2026-07-21T10:00:00Z',
    })
    assert.deepEqual(receipt.lineItems, [
      { fuelType: 'Diesel', volume: 10, unitPrice: 10.05, amount: 100.5 },
    ])
    assert.deepEqual(receipt.totals, {
      subtotal: 87.39,
      tax: 13.11,
      total: 100.5,
    })
    assert.deepEqual(receipt.payments, [
      { method: 'CARD', reference: 'AUTH-1' },
    ])
    assert.deepEqual(receipt.qr, {
      data: 'QR',
      imageBase64: null,
      url: 'https://verify.example',
    })
  })

  it('falls back from raw line items to transaction fields', () => {
    const rawItems = normalizeReceipt({
      transaction: {},
      raw: {
        payload: {
          receipt: {
            seller: { stationName: 'Station A', phone: '0123' },
            lines: [
              {
                fuelType: 'Petrol',
                quantity: '5',
                unitPrice: '20',
                lineTotal: '100',
              },
            ],
          },
        },
      },
    })
    assert.equal(rawItems.header.name, 'Station A')
    assert.equal(rawItems.header.contact, '0123')
    assert.equal(rawItems.lineItems[0]?.fuelType, 'Petrol')

    const transactionFallback = normalizeReceipt({
      transaction: {
        fuel_type: 'LPG',
        volume: '2',
        unit_price: '30',
        total_amount: '60',
      },
    })
    assert.deepEqual(transactionFallback.lineItems, [
      { fuelType: 'LPG', volume: 2, unitPrice: 30, amount: 60 },
    ])
    assert.equal(transactionFallback.payments, undefined)
    assert.equal(transactionFallback.qr, undefined)
  })
})
