import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildReceiptEscposLines } from '@/src/modules/printing/domain/receiptPrintDocument'

describe('Tanzania offline receipt printing', () => {
  it('adds OFFLINE PRINT immediately before the TRA footer image', () => {
    const lines = buildReceiptEscposLines({
      country: 'TZ',
      plainText: [
        '[IMAGE:TRA_RECEIPT_START]',
        'TEST STATION',
        '[QR]',
        'https://verify.example.test/receipt',
        'Thank you',
        '[IMAGE:TRA_RECEIPT_END]',
      ].join('\n'),
      qrData: 'https://verify.example.test/receipt',
      offlinePrint: true,
    })

    const footerIndex = lines.findIndex(
      (line) => line.type === 'image' && line.asset === 'tra-receipt-end',
    )
    assert.ok(footerIndex > 0)
    assert.deepEqual(lines[footerIndex - 1], {
      type: 'text',
      value: 'OFFLINE PRINT',
      align: 'center',
      bold: true,
    })
  })

  it('preserves receipt QR output on an offline print', () => {
    const lines = buildReceiptEscposLines({
      country: 'TZ',
      plainText: '[QR]\nhttps://verify.example.test/receipt',
      qrData: 'https://verify.example.test/receipt',
      offlinePrint: true,
    })

    assert.equal(lines.some((line) => line.type === 'qr'), true)
    assert.equal(
      lines.some(
        (line) => line.type === 'text' && line.value === 'OFFLINE PRINT',
      ),
      true,
    )
  })

  it('keeps normal Tanzania receipts unchanged', () => {
    const lines = buildReceiptEscposLines({
      country: 'TZ',
      plainText: '[QR]\nhttps://verify.example.test/receipt',
      qrData: 'https://verify.example.test/receipt',
    })

    assert.equal(lines.some((line) => line.type === 'qr'), true)
    assert.equal(
      lines.some(
        (line) => line.type === 'text' && line.value === 'OFFLINE PRINT',
      ),
      false,
    )
  })
})
