import assert from 'node:assert/strict'
import test from 'node:test'
import { completeVerifiedRecoveredReceipt } from '@/src/modules/fiscalization/application/verifiedRecoveryReceiptCompletion'

const input = {
  stationId: 'S1', transactionId: 'T1', documentId: 'D1',
  fiscalEventId: 'E1', countryCode: 'TZ' as const,
}
const row = {
  id: 'R1', receipt_number: 'RC1',
  transaction_document_id: 'D1', latest_fiscal_event_id: 'E1',
  fiscalization_reference: 'REF1', event_id: 'E1',
  event_status: 'SUCCESS', event_reference: 'REF1',
  fiscal_data: { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'RC1' } },
}

test('verified receipt permits idempotent auto-print request', async () => {
  const keys: string[] = []
  const result = await completeVerifiedRecoveredReceipt(
    { async find() { return row } },
    {
      async isAutoPrintEnabled() { return true },
      async ensurePrintJob(job) {
        keys.push(job.idempotencyKey)
        assert.equal(job.receiptId, 'R1')
        return { idempotencyVerified: true }
      },
    }, input,
  )
  assert.equal(result.ready, true)
  assert.deepEqual(keys, ['receipt:T1:default'])
})

test('missing and contradictory fiscal receipt evidence prevents printing', async () => {
  for (const candidate of [
    null,
    { ...row, event_id: 'OTHER' },
    { ...row, event_reference: null },
    { ...row, fiscal_data: { schemaVersion: 1, reference: 'OTHER', receipt: { receiptNumber: 'RC1' } } },
  ]) {
    let printingInvoked = false
    const result = await completeVerifiedRecoveredReceipt(
      { async find() { return candidate } },
      {
        async isAutoPrintEnabled() { printingInvoked = true; return true },
        async ensurePrintJob() { printingInvoked = true; return { idempotencyVerified: true } },
      }, input,
    )
    assert.equal(result.ready, false)
    assert.equal(printingInvoked, false)
  }
})

test('disabled auto-print does not enqueue a job', async () => {
  const result = await completeVerifiedRecoveredReceipt(
    { async find() { return row } },
    {
      async isAutoPrintEnabled() { return false },
      async ensurePrintJob() { throw new Error('Must not enqueue') },
    }, input,
  )
  assert.equal(result.ready, true)
})

test('failure to verify print-job idempotency blocks completion', async () => {
  const result = await completeVerifiedRecoveredReceipt(
    { async find() { return row } },
    {
      async isAutoPrintEnabled() { return true },
      async ensurePrintJob() { return { idempotencyVerified: false } },
    }, input,
  )
  assert.equal(result.ready, false)
})
