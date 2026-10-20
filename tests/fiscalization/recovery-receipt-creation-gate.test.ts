import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRecoveryReceiptCreation } from '@/src/modules/fiscalization/infrastructure/recoveryReceiptCreationGate'

const expected = { countryCode: 'TZ' as const, documentId: 'D1', fiscalEventId: 'E1' }
const candidate = {
  receiptNumber: 'RC1',
  transactionDocumentId: 'D1',
  fiscalEventId: 'E1',
  fiscalReference: 'REF1',
  fiscalData: {
    schemaVersion: 1,
    reference: 'REF1',
    receipt: { receiptNumber: 'RC1' },
  },
}

test('creation candidate requires correlated persisted-style fiscal evidence', () => {
  assert.equal(assessRecoveryReceiptCreation(candidate, expected).allowed, true)
})

test('missing provider identity and guessed status metadata cannot authorize receipt', () => {
  assert.equal(assessRecoveryReceiptCreation(null, expected).allowed, false)
  for (const changed of [
    { receiptNumber: '' },
    { transactionDocumentId: 'OTHER' },
    { fiscalEventId: 'OTHER' },
    { fiscalReference: '' },
    { fiscalReference: 'WRONG' },
    { fiscalData: null },
    { fiscalData: { schemaVersion: 1, reference: 'WRONG', receipt: { receiptNumber: 'RC1' } } },
    { fiscalData: { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'OTHER' } } },
  ]) {
    assert.equal(assessRecoveryReceiptCreation({ ...candidate, ...changed }, expected).allowed, false)
  }
})

test('both country policies require the same reference provenance', () => {
  assert.equal(assessRecoveryReceiptCreation(candidate, { ...expected, countryCode: 'KE' }).allowed, true)
})
