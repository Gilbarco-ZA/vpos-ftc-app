import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateStatusReconciliation } from '@/src/modules/fiscalization/application/statusReconciliationGuard'

test('correlated confirmed status may mark exactly that transaction fiscalized', () => {
  const result = evaluateStatusReconciliation('TZ', 'DOC-1', {
    error: false, documentId: 'DOC-1', details: { isFiscalized: true },
  })
  assert.equal(result.canMarkFiscalized, true)
  assert.equal(result.canAutomaticallyResubmit, false)
  assert.equal(result.requiresManualReview, false)
})

test('missing or mismatched reference cannot finalize even on success', () => {
  for (const documentId of [undefined, 'DOC-2']) {
    const result = evaluateStatusReconciliation('KE', 'DOC-1', {
      error: false, documentId, status: 'SUCCESS',
    })
    assert.equal(result.canMarkFiscalized, false)
    assert.equal(result.requiresManualReview, true)
  }
})

test('pending and failed outcomes never authorize duplicate submission', () => {
  for (const status of ['FISCALIZING', 'PENDING', 'FAILED', 'UNKNOWN']) {
    const result = evaluateStatusReconciliation('TZ', 'DOC-1', {
      error: status === 'FAILED', documentId: 'DOC-1', status,
    })
    assert.equal(result.canMarkFiscalized, false)
    assert.equal(result.canAutomaticallyResubmit, false)
  }
})

test('reject empty transaction references and unknown countries', () => {
  assert.throws(() => evaluateStatusReconciliation('TZ', '', { error: false }), /required/)
  assert.throws(() => evaluateStatusReconciliation('XX', 'DOC-1', { error: false }), /Unsupported/)
})
