import assert from 'node:assert/strict'
import test from 'node:test'
import { applyKenyaReceiptFiscalUpdate } from '@/src/modules/transactions/application/queries/kenya-receipt-fiscal-update'
import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'

const receipt = () => ({
  footer: {
    fiscalVerificationCode: 'OLD',
    fiscalQrCodeData: 'OLD-QR',
    receiptSignature: 'OLD-SIGNATURE',
    receiptInternalData: 'OLD-INTERNAL',
  },
  meta: { receiptNumber: 'OLD-NUMBER' },
}) as unknown as NormalizedReceipt

test('fetch receipt uses latest Kenya response while retaining historical metadata', () => {
  const value = receipt()
  applyKenyaReceiptFiscalUpdate(value, {
    eventResponsePayload: {
      details: { receipt: {
        receiptNumber: '1031',
        receiptSignature: 'PPRTYH39LUQJTPPE',
        receiptInternalData: 'ICC6H9I53HIWEOQZB6UYF5HFLT',
      } },
    },
    canonicalResponsePayload: {
      fiscalVerificationCode: 'PPRTYH39LUQJTPPE',
      fiscalQrCodeData: 'https://etims-sbx.kra.go.ke/receipt',
    },
    storedFiscalData: null,
  })
  assert.equal(value.meta.receiptNumber, '1031')
  assert.equal(value.footer.fiscalVerificationCode, 'PPRTYH39LUQJTPPE')
  assert.equal(value.footer.fiscalQrCodeData, 'https://etims-sbx.kra.go.ke/receipt')
  assert.equal(value.footer.receiptSignature, 'PPRTYH39LUQJTPPE')
  assert.equal(value.footer.receiptInternalData, 'ICC6H9I53HIWEOQZB6UYF5HFLT')
})

test('missing latest fields preserve stored fiscal receipt values', () => {
  const value = receipt()
  applyKenyaReceiptFiscalUpdate(value, {
    eventResponsePayload: { status: 'Approved' },
    canonicalResponsePayload: {},
    storedFiscalData: { receipt: {
      fiscalVerificationCode: 'SAVED-CODE',
      fiscalQrCodeData: 'SAVED-QR',
      receiptSignature: 'SAVED-SIGNATURE',
      receiptInternalData: 'SAVED-INTERNAL',
      receiptNumber: '1031',
    } },
  })
  assert.equal(value.footer.fiscalVerificationCode, 'SAVED-CODE')
  assert.equal(value.footer.receiptInternalData, 'SAVED-INTERNAL')
  assert.equal(value.meta.receiptNumber, '1031')
})

test('status-only responses do not invent missing fiscal fields', () => {
  const value = receipt()
  applyKenyaReceiptFiscalUpdate(value, {
    eventResponsePayload: { status: 'Approved', revenueAuthorityReference: '1031' },
    canonicalResponsePayload: null,
    storedFiscalData: null,
  })
  assert.equal(value.footer.fiscalVerificationCode, 'OLD')
  assert.equal(value.meta.receiptNumber, 'OLD-NUMBER')
})
