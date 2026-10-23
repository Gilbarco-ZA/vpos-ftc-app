import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRecoveryCompletionParity } from '@/src/modules/fiscalization/application/recoveryCompletionParity'

const complete = {
  fiscalEventLinked: true,
  receiptId: 'R1',
  receiptNumber: 'RCPT1',
  receiptFiscalDataVerified: true,
  autoPrintEnabled: true,
  printJobIdempotencyVerified: true,
}

test('recovered transaction is ready only with audit, receipt and print parity', () => {
  assert.deepEqual(assessRecoveryCompletionParity(complete), { ready: true, blockers: [] })
})

test('missing receipt details block completion even with confirmed fiscal event', () => {
  const result = assessRecoveryCompletionParity({
    ...complete, receiptId: null, receiptNumber: null,
  })
  assert.equal(result.ready, false)
  assert.match(result.blockers.join(' '), /receipt identity/i)
})

test('unverified fiscal receipt data prevents completion', () => {
  assert.equal(assessRecoveryCompletionParity({
    ...complete, receiptFiscalDataVerified: false,
  }).ready, false)
})

test('printing requires idempotency when auto-print is enabled', () => {
  assert.equal(assessRecoveryCompletionParity({
    ...complete, printJobIdempotencyVerified: false,
  }).ready, false)
  assert.equal(assessRecoveryCompletionParity({
    ...complete, autoPrintEnabled: false, printJobIdempotencyVerified: false,
  }).ready, true)
})

test('missing event association prevents completion', () => {
  const result = assessRecoveryCompletionParity({
    ...complete, fiscalEventLinked: false,
  })
  assert.equal(result.ready, false)
  assert.match(result.blockers.join(' '), /Fiscalization event/)
})
