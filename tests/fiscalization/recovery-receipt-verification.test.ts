import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyRecoveryReceiptRow, verifyPersistedRecoveryReceipt } from '@/src/modules/fiscalization/infrastructure/recoveryReceiptVerification'

const expected = { countryCode: 'TZ' as const, documentId: 'D1', fiscalEventId: 'E1' }
const row = {
  id: 'R1', receipt_number: 'RC1',
  transaction_document_id: 'D1', latest_fiscal_event_id: 'E1',
  fiscalization_reference: 'REF1', event_id: 'E1',
  event_status: 'SUCCESS', event_reference: 'REF1',
  fiscal_data: { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'RC1' } },
}

test('verifies a persisted receipt only when transaction event and snapshot agree', () => {
  assert.equal(verifyRecoveryReceiptRow(row, expected).verified, true)
})

test('wrong document, event or status never verifies a receipt', () => {
  for (const change of [
    { transaction_document_id: 'OTHER' },
    { latest_fiscal_event_id: 'OTHER' },
    { event_id: 'OTHER' },
    { event_status: 'FAILED' },
    { event_reference: null },
    { fiscalization_reference: null },
  ]) {
    assert.equal(verifyRecoveryReceiptRow({ ...row, ...change }, expected).verified, false)
  }
})

test('invalid, stale and mismatched receipt snapshots fail closed', () => {
  for (const fiscal_data of [
    null, 'invalid-json',
    { schemaVersion: 2, reference: 'REF1', receipt: { receiptNumber: 'RC1' } },
    { schemaVersion: 1, reference: 'WRONG', receipt: { receiptNumber: 'RC1' } },
    { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'WRONG' } },
  ]) {
    assert.equal(verifyRecoveryReceiptRow({ ...row, fiscal_data }, expected).verified, false)
  }
})

test('read-only verification delegates station-scoped lookup to injected port', async () => {
  const calls: unknown[] = []
  const result = await verifyPersistedRecoveryReceipt({
    async find(input) { calls.push(input); return row },
  }, { stationId: 'S1', transactionId: 'T1', ...expected })
  assert.equal(result.verified, true)
  assert.deepEqual(calls, [{ stationId: 'S1', transactionId: 'T1' }])
})

test('both country policies reject missing fiscal reference provenance', () => {
  for (const countryCode of ['KE', 'TZ'] as const) {
    assert.equal(verifyRecoveryReceiptRow(row, { ...expected, countryCode }).verified, true)
    assert.equal(verifyRecoveryReceiptRow({ ...row, event_reference: 'OTHER' },
      { ...expected, countryCode }).verified, false)
    assert.equal(verifyRecoveryReceiptRow({ ...row, fiscalization_reference: null },
      { ...expected, countryCode }).verified, false)
  }
})

test('status metadata does not substitute for missing persisted references', () => {
  const statusEvidence = {
    fiscalId: 'REF1', fiscalCode: 'REF1', fiscalVerificationCode: 'REF1',
    fiscalQrCodeData: 'REF1', revenueAuthorityReference: 'REF1',
  }
  const result = verifyRecoveryReceiptRow({ ...row, event_reference: null }, {
    ...expected, statusEvidence,
  })
  assert.equal(result.verified, false)
})
