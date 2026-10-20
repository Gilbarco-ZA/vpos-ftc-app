import assert from 'node:assert/strict'
import test from 'node:test'
import { completeRecoveredReceipt } from '@/src/modules/fiscalization/application/recoveryReceiptCompletion'
import type { RecoveryReceiptCompletionPort } from '@/src/modules/fiscalization/application/recoveryReceiptCompletion'

const input = { stationId: 'S1', transactionId: 'T1', documentId: 'D1', fiscalEventLinked: true }

test('reuses a verified receipt and uses the existing auto-print idempotency key', async () => {
  const keys: string[] = []
  const port: RecoveryReceiptCompletionPort = {
    async findReceipt() { return { id: 'R1', number: 'RCPT1', fiscalDataVerified: true } },
    async ensureReceipt() { throw new Error('unexpected creation') },
    async isAutoPrintEnabled() { return true },
    async ensurePrintJob(job) {
      keys.push(job.idempotencyKey)
      return { idempotencyVerified: true }
    },
  }
  const result = await completeRecoveredReceipt(port, input)
  assert.equal(result.ready, true)
  assert.deepEqual(keys, ['receipt:T1:default'])
})

test('missing receipts are created through injected transaction-local port', async () => {
  let count = 0
  const port: RecoveryReceiptCompletionPort = {
    async findReceipt() { return null },
    async ensureReceipt() { count++; return { id: 'R1', number: 'RCPT1', fiscalDataVerified: true } },
    async isAutoPrintEnabled() { return false },
    async ensurePrintJob() { throw new Error('printing disabled') },
  }
  assert.equal((await completeRecoveredReceipt(port, input)).ready, true)
  assert.equal(count, 1)
})

test('unverified receipts cannot trigger printing', async () => {
  let printed = false
  const port: RecoveryReceiptCompletionPort = {
    async findReceipt() { return { id: 'R1', number: 'RCPT1', fiscalDataVerified: false } },
    async ensureReceipt() { throw new Error('unexpected') },
    async isAutoPrintEnabled() { return true },
    async ensurePrintJob() { printed = true; return { idempotencyVerified: true } },
  }
  assert.equal((await completeRecoveredReceipt(port, input)).ready, false)
  assert.equal(printed, false)
})

test('missing fiscal event blocks all receipt operations', async () => {
  let read = false
  const port: RecoveryReceiptCompletionPort = {
    async findReceipt() { read = true; return null },
    async ensureReceipt() { throw new Error('unexpected') },
    async isAutoPrintEnabled() { return false },
    async ensurePrintJob() { throw new Error('unexpected') },
  }
  await assert.rejects(completeRecoveredReceipt(port, { ...input, fiscalEventLinked: false }), /Linked fiscalization/)
  assert.equal(read, false)
})

test('print operation must confirm idempotency', async () => {
  const port: RecoveryReceiptCompletionPort = {
    async findReceipt() { return { id: 'R1', number: 'RCPT1', fiscalDataVerified: true } },
    async ensureReceipt() { throw new Error('unexpected') },
    async isAutoPrintEnabled() { return true },
    async ensurePrintJob() { return { idempotencyVerified: false } },
  }
  assert.equal((await completeRecoveredReceipt(port, input)).ready, false)
})
