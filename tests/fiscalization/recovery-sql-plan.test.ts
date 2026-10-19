import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRecoveryStatusTransitionSql,
  recoveryAuditIdempotencyKey,
} from '@/src/modules/fiscalization/infrastructure/recoverySqlPlan'

const identifiers = { stationId: 'S1', transactionId: 'T1', documentId: 'D1' }

test('SQL plan guards station, transaction, proxy document, state, and deletion', () => {
  const plan = buildRecoveryStatusTransitionSql(identifiers)
  assert.deepEqual(plan.params, ['S1', 'T1', 'D1'])
  assert.match(plan.sql, /station_id = \$1::uuid/)
  assert.match(plan.sql, /id = \$2::uuid/)
  assert.match(plan.sql, /fiscal_document_id = \$3/)
  assert.match(plan.sql, /status = 'FISCALIZING'/)
  assert.match(plan.sql, /deleted_at IS NULL/)
  assert.match(plan.sql, /RETURNING id/)
  assert.doesNotMatch(plan.sql, /version/)
})

test('recovery audit key is stable per transaction and document', () => {
  assert.equal(
    recoveryAuditIdempotencyKey(' T1 ', ' D1 '),
    recoveryAuditIdempotencyKey('T1', 'D1'),
  )
  assert.notEqual(recoveryAuditIdempotencyKey('T1', 'D1'), recoveryAuditIdempotencyKey('T1', 'D2'))
})

test('missing identifiers cannot produce write statements', () => {
  assert.throws(() => buildRecoveryStatusTransitionSql({ ...identifiers, documentId: '' }), /required/)
  assert.throws(() => recoveryAuditIdempotencyKey('', 'D1'), /required/)
})
