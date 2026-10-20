import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesRecoveryPrintJob } from '@/src/modules/fiscalization/infrastructure/recoveryPrintJobPolicy'

const expected = {
  transactionId: 'T1', receiptId: 'R1', receiptNumber: 'RC1',
  idempotencyKey: 'receipt:T1:default',
}
const job = {
  idempotency_key: expected.idempotencyKey,
  source_transaction_id: expected.transactionId,
  job_type: 'print.receipt',
  payload: {
    storageMode: 'reference', source: 'vpos.auto-print-receipt',
    receiptId: expected.receiptId, receiptNumber: expected.receiptNumber,
  },
}

test('existing matching job is idempotent without re-enqueueing', () => {
  assert.equal(matchesRecoveryPrintJob(job, expected), true)
  assert.equal(matchesRecoveryPrintJob({ ...job, payload: JSON.stringify(job.payload) }, expected), true)
})

test('conflicting identity or job metadata fails closed', () => {
  assert.equal(matchesRecoveryPrintJob(null, expected), false)
  for (const variant of [
    { idempotency_key: 'OTHER' },
    { source_transaction_id: 'OTHER' },
    { job_type: 'print.report' },
    { payload: 'invalid' },
    { payload: { ...job.payload, receiptId: 'OTHER' } },
    { payload: { ...job.payload, receiptNumber: 'OTHER' } },
    { payload: { ...job.payload, storageMode: 'embedded' } },
    { payload: { ...job.payload, source: 'OTHER' } },
  ]) {
    assert.equal(matchesRecoveryPrintJob({ ...job, ...variant }, expected), false)
  }
})
