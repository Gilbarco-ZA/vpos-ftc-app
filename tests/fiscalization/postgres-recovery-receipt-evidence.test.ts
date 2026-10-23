import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeRecoveryReceiptCandidate } from '@/src/modules/fiscalization/infrastructure/postgresRecoveryReceiptEvidence'

const expected = { countryCode: 'TZ' as const, documentId: 'D1', fiscalEventId: 'E1' }
const persisted = {
  documentId: 'D1', fiscalEventId: 'E1',
  transactionReference: 'REF1', eventReference: 'REF1',
  eventStatus: 'SUCCESS', status: 'FISCALIZED',
}
const candidate = {
  transactionDocumentId: 'D1', fiscalEventId: 'E1',
  fiscalReference: 'REF1', receiptNumber: 'RC1',
  fiscalData: {
    schemaVersion: 1, reference: 'REF1',
    receipt: { receiptNumber: 'RC1' },
  },
}

test('current transaction and linked event allow verified receipt candidate', () => {
  assert.equal(authorizeRecoveryReceiptCandidate(persisted, candidate, expected).allowed, true)
})

test('stale transaction, event and fiscal references cannot authorize creation', () => {
  assert.equal(authorizeRecoveryReceiptCandidate(null, candidate, expected).allowed, false)
  for (const change of [
    { status: 'FISCALIZING' },
    { documentId: 'OTHER' },
    { fiscalEventId: 'OTHER' },
    { transactionReference: null },
    { eventReference: 'OTHER' },
    { eventStatus: 'FAILED' },
  ]) {
    assert.equal(authorizeRecoveryReceiptCandidate({ ...persisted, ...change }, candidate, expected).allowed, false)
  }
})

test('missing or inconsistent fiscal snapshot cannot authorize creation', () => {
  assert.equal(authorizeRecoveryReceiptCandidate(persisted, null, expected).allowed, false)
  assert.equal(authorizeRecoveryReceiptCandidate(persisted, {
    ...candidate,
    fiscalData: { schemaVersion: 1, reference: 'OTHER', receipt: { receiptNumber: 'RC1' } },
  }, expected).allowed, false)
})
