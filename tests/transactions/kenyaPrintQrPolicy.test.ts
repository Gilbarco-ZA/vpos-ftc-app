import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReceiptEscposLines } from '@/src/modules/printing/domain/receiptPrintDocument'
import { buildReceiptLines } from '@/src/shared/fiscalization/receipt/templates/KE'
import type { FiscalReceiptModel } from '@/src/shared/fiscalization/receipt/types'

test('Kenya physical printer never encodes legacy fiscal JSON as QR', () => {
  const lines = buildReceiptEscposLines({
    country: 'KE', plainText: '[QR]\n{"fiscal_document_id":"DOC","verification_url":""}',
    qrData: '{"fiscal_document_id":"DOC","verification_url":""}',
  })
  assert.equal(lines.some(line => line.type === 'qr'), false)
})

test('Kenya physical printer uses actual refreshed KRA URL instead of saved JSON', () => {
  const url = 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=TEST'
  const lines = buildReceiptEscposLines({
    country: 'KE', plainText: '[QR]\n{"fiscal_document_id":"DOC","verification_url":""}',
    qrData: url,
  })
  assert.deepEqual(lines.filter(line => line.type === 'qr'), [{ type: 'qr', value: url }])
})

test('Kenya fiscal receipt has tax invoice, VAT and SCU sections with KRA QR', () => {
  const url = 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=TEST'
  const model = {
    station: { name: 'Test Station', country: 'KE', taxId: 'P123' },
    transaction: { date: '2026-10-27', invoiceNo: '1031', fiscalReference: '1031' },
    customer: { name: 'Customer', tin: 'PIN123' },
    items: [{ name: 'Diesel 50', quantity: 1.8, unitPrice: 178.36, amount: 321.05, taxCode: 'B' }],
    taxSummary: [{ taxCode: 'B', label: 'VAT', rate: 16, taxableAmount: 276.77, taxAmount: 44.28 }],
    payment: { method: 'Cash', amount: 321.05, itemsCount: 1, currency: 'KES' },
    fiscalMeta: { receiptNumber: '1031', internalData: 'INTERNAL', signature: 'SIGN' },
    qrPayload: { data: url, verificationUrl: url },
    decimals: { volume: 2, money: 2, unitPrice: 2 },
  } as FiscalReceiptModel
  const lines = buildReceiptLines(model)
  assert.ok(lines.some(line => line.type === 'text' && line.value === 'TAX INVOICE'))
  assert.ok(lines.some(line => line.type === 'text' && line.value === 'SCU INFORMATION'))
  assert.ok(lines.some(line => line.type === 'text' && line.value.includes('VAT')))
  assert.deepEqual(lines.filter(line => line.type === 'qr'), [{ type: 'qr', value: url }])
})

test('Kenya print appends refreshed KRA QR to historical receipt without QR marker', () => {
  const url = 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=NEW'
  const lines = buildReceiptEscposLines({
    country: 'KE', plainText: 'TAX INVOICE\nSCU INFORMATION\nReceipt Number: 36',
    qrData: url,
  })
  assert.deepEqual(lines.filter(line => line.type === 'qr'), [{ type: 'qr', value: url }])
})
