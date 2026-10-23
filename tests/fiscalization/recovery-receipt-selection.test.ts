import assert from 'node:assert/strict'
import test from 'node:test'
import { selectUniqueRecoveryReceipt } from '@/src/modules/fiscalization/infrastructure/recoveryReceiptSelection'
import type { RecoveryReceiptRow } from '@/src/modules/fiscalization/infrastructure/recoveryReceiptVerification'

const receipt: RecoveryReceiptRow = {
  id: 'R1',
  receipt_number: 'RC1',
  fiscal_data: { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'RC1' } },
  transaction_document_id: 'D1',
  latest_fiscal_event_id: 'E1',
  fiscalization_reference: 'REF1',
  event_id: 'E1',
  event_status: 'SUCCESS',
  event_reference: 'REF1',
}

test('missing persisted receipt is not silently generated', () => {
  assert.equal(selectUniqueRecoveryReceipt([]), null)
})

test('exactly one persisted receipt is accepted for further fiscal verification', () => {
  assert.equal(selectUniqueRecoveryReceipt([receipt]), receipt)
})

test('two distinct active receipts cause ambiguity rather than choosing newest', () => {
  assert.throws(() => selectUniqueRecoveryReceipt([
    receipt,
    { ...receipt, id: 'R2', receipt_number: 'RC2' },
  ]), /Ambiguous persisted receipts/)
})
