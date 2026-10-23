import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCompleteRecoveryReceiptCandidate } from '@/src/modules/fiscalization/infrastructure/postgresRecoveryReceiptInsert'

const candidate = {
  receiptNumber: 'RC1', transactionDocumentId: 'D1', fiscalEventId: 'E1',
  fiscalReference: 'REF1', plainTextContent: 'Receipt RC1', renderVersion: 1,
  fiscalData: {
    schemaVersion: 1, reference: 'REF1',
    receipt: { country: 'TZ', receiptNumber: 'RC1', fiscalVerificationCode: 'VERIFY1' },
  },
}

test('transactional receipt writer requires country fiscal metadata and printable contents', () => {
  assert.equal(validateCompleteRecoveryReceiptCandidate(candidate, 'TZ').allowed, true)
  for (const changed of [
    { plainTextContent: '' },
    { renderVersion: 0 },
    { fiscalData: { ...candidate.fiscalData, receipt: { country: 'KE', receiptNumber: 'RC1', fiscalVerificationCode: 'VERIFY1' } } },
    { fiscalData: { ...candidate.fiscalData, receipt: { country: 'TZ', receiptNumber: 'RC1' } } },
  ]) {
    assert.equal(validateCompleteRecoveryReceiptCandidate({ ...candidate, ...changed }, 'TZ').allowed, false)
  }
})

test('missing fiscal snapshot cannot be treated as a complete receipt', () => {
  assert.equal(validateCompleteRecoveryReceiptCandidate({ ...candidate, fiscalData: null }, 'TZ').allowed, false)
})
