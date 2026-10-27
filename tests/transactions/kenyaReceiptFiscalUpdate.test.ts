import test from 'node:test'
import assert from 'node:assert/strict'
import { applyKenyaReceiptFiscalUpdate } from '@/src/modules/transactions/application/queries/kenya-receipt-fiscal-update'
import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'

const makeReceipt = () => ({
  footer: { fiscalVerificationCode: '', fiscalQrCodeData: '', receiptSignature: '', receiptInternalData: '' },
  meta: { receiptNumber: '' },
}) as unknown as NormalizedReceipt

test('Kenya receipt refresh displays approved matching status verification data', () => {
  const receipt = makeReceipt()
  applyKenyaReceiptFiscalUpdate(receipt, {
    eventResponsePayload: { details: { receipt: { receiptSignature: 'SIGN', receiptInternalData: 'INTERNAL' } } },
    canonicalResponsePayload: null,
    storedFiscalData: null,
    expectedDocumentId: 'D1CEF7E18822',
    statusRow: {
      documentId: 'D1CEF7E18822', documentNumber: '1031', status: 'Approved',
      fiscalVerificationCode: 'PPRTYH39LUQJTPPE', fiscalQrCodeData: 'https://example.com/qr',
      error: false,
    },
  })
  assert.equal(receipt.footer.fiscalVerificationCode, 'PPRTYH39LUQJTPPE')
  assert.equal(receipt.footer.fiscalQrCodeData, 'https://example.com/qr')
  assert.equal(receipt.footer.receiptSignature, 'SIGN')
  assert.equal(receipt.footer.receiptInternalData, 'INTERNAL')
  assert.equal(receipt.meta.receiptNumber, '1031')
})

test('Kenya receipt does not apply unapproved or uncorrelated status evidence', () => {
  for (const statusRow of [
    { documentId: 'OTHER', status: 'Approved', fiscalVerificationCode: 'WRONG' },
    { documentId: 'DOC', status: 'Submitted', fiscalVerificationCode: 'PENDING' },
  ]) {
    const receipt = makeReceipt()
    applyKenyaReceiptFiscalUpdate(receipt, {
      eventResponsePayload: null, canonicalResponsePayload: null, storedFiscalData: null,
      expectedDocumentId: 'DOC', statusRow,
    })
    assert.equal(receipt.footer.fiscalVerificationCode, '')
  }
})

test('Kenya receipt prefers fresh approved verification over stale local metadata', () => {
  const receipt = makeReceipt()
  applyKenyaReceiptFiscalUpdate(receipt, {
    eventResponsePayload: { details: { receipt: { fiscalVerificationCode: 'ORIGINAL' } } },
    canonicalResponsePayload: null, storedFiscalData: null,
    expectedDocumentId: 'DOC',
    statusRow: { documentId: 'DOC', status: 'Approved', fiscalVerificationCode: 'DIFFERENT' },
  })
  assert.equal(receipt.footer.fiscalVerificationCode, 'DIFFERENT')
  assert.equal(receipt.footer.receiptSignature, undefined)
})

test('Kenya POST sdcId becomes SCU ID and sdcId/receiptNumber becomes CU invoice number', () => {
  const receipt = makeReceipt()
  applyKenyaReceiptFiscalUpdate(receipt, {
    eventResponsePayload: {
      documentId: 'INV-2026-10-27-01', status: 'Submitted',
      details: {
        sdcId: 'KRACU0300003727',
        receipt: { receiptNumber: '1058', fiscalVerificationCode: 'RCTPJKUDBLEHV2SK' },
      },
    },
    canonicalResponsePayload: null, storedFiscalData: null,
    expectedDocumentId: 'INV-2026-10-27-01',
  })
  assert.equal(receipt.meta.scuId, 'KRACU0300003727')
  assert.equal(receipt.meta.cuInvoiceNo, 'KRACU0300003727/1058')
  assert.equal(receipt.footer.fiscalVerificationCode, 'RCTPJKUDBLEHV2SK')
})
