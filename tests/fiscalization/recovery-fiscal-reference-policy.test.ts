import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileRecoveryFiscalReference } from '@/src/modules/fiscalization/application/recoveryFiscalReferencePolicy'

const base = {
  countryCode: 'TZ' as const, documentId: 'D1', transactionDocumentId: 'D1',
  transactionReference: 'REF1', eventReference: 'REF1', eventStatus: 'SUCCESS',
  statusEvidence: {
    fiscalId: 'F1', fiscalCode: 'C1', fiscalVerificationCode: 'V1',
    fiscalQrCodeData: 'QR1', revenueAuthorityReference: 'RA1',
  },
}

test('KE and TZ accept only existing matching event and transaction reference', () => {
  for (const countryCode of ['TZ', 'KE'] as const) {
    assert.deepEqual(reconcileRecoveryFiscalReference({ ...base, countryCode }), {
      kind: 'verified', reference: 'REF1', source: 'existing-transaction-and-event',
    })
  }
})

test('status fiscal metadata cannot create a missing receipt reference', () => {
  for (const override of [
    { transactionReference: null },
    { eventReference: null },
    { eventReference: 'WRONG' },
    { eventStatus: 'PENDING' },
    { transactionDocumentId: 'OTHER' },
  ]) {
    assert.equal(reconcileRecoveryFiscalReference({ ...base, ...override }).kind, 'unresolved')
  }
})

test('status evidence is not mapped to the receipt reference', () => {
  const outcome = reconcileRecoveryFiscalReference({
    ...base, transactionReference: null, eventReference: null,
  })
  assert.equal(outcome.kind, 'unresolved')
})
