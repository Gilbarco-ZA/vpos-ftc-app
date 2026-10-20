import assert from 'node:assert/strict'
import test from 'node:test'
import { completeRecoveryReceiptPrintAtomically } from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryReceiptPrint'
import type { RecoveryReceiptPrintBoundary } from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryReceiptPrint'

const input = { stationId: 'S1', transactionId: 'T1', documentId: 'D1', fiscalEventId: 'E1', countryCode: 'TZ' as const }
const receipt = {
  id: 'R1', receipt_number: 'RC1',
  transaction_document_id: 'D1', latest_fiscal_event_id: 'E1',
  fiscalization_reference: 'REF1', event_id: 'E1',
  event_status: 'SUCCESS', event_reference: 'REF1',
  fiscal_data: { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'RC1' } },
}

test('verified recovery creates print eligibility inside the same transaction', async () => {
  let committed = false
  const boundary: RecoveryReceiptPrintBoundary = {
    async transaction(run) {
      const result = await run({
        receiptRead: { async find() { return receipt } },
        printing: {
          async isAutoPrintEnabled() { return true },
          async ensurePrintJob(job) {
            assert.equal(job.idempotencyKey, 'receipt:T1:default')
            return { idempotencyVerified: true }
          },
        },
      })
      committed = true
      return result
    },
  }
  assert.deepEqual(await completeRecoveryReceiptPrintAtomically(boundary, input), { outcome: 'ready' })
  assert.equal(committed, true)
})

test('unverified receipt blocks before print and does not commit', async () => {
  let committed = false
  let printed = false
  const boundary: RecoveryReceiptPrintBoundary = {
    async transaction(run) {
      const result = await run({
        receiptRead: { async find() { return { ...receipt, event_reference: null } } },
        printing: {
          async isAutoPrintEnabled() { return true },
          async ensurePrintJob() { printed = true; return { idempotencyVerified: true } },
        },
      })
      committed = true
      return result
    },
  }
  const outcome = await completeRecoveryReceiptPrintAtomically(boundary, input)
  assert.equal(outcome.outcome, 'blocked')
  assert.equal(committed, false)
  assert.equal(printed, false)
})

test('print idempotency failure rolls back instead of committing', async () => {
  let committed = false
  const boundary: RecoveryReceiptPrintBoundary = {
    async transaction(run) {
      const result = await run({
        receiptRead: { async find() { return receipt } },
        printing: {
          async isAutoPrintEnabled() { return true },
          async ensurePrintJob() { return { idempotencyVerified: false } },
        },
      })
      committed = true
      return result
    },
  }
  assert.equal((await completeRecoveryReceiptPrintAtomically(boundary, input)).outcome, 'blocked')
  assert.equal(committed, false)
})

test('database failures propagate without being misclassified as blocked', async () => {
  const boundary: RecoveryReceiptPrintBoundary = {
    async transaction() { throw new Error('database unavailable') },
  }
  await assert.rejects(completeRecoveryReceiptPrintAtomically(boundary, input), /database unavailable/)
})
