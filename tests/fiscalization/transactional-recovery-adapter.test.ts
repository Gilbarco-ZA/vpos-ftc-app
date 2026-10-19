import assert from 'node:assert/strict'
import test from 'node:test'
import {
  confirmTransactionFiscalizedAtomically,
} from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryAdapter'
import type {
  RecoveryTransactionBoundary,
} from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryAdapter'

const input = {
  stationId: 'S1', transactionId: 'T1', documentId: 'D1',
  observedStatus: 'FISCALIZED', confirmed: true as const,
}

test('guarded transaction updates once and records matching audit in same boundary', async () => {
  let state = 'FISCALIZING'
  const audits: string[] = []
  const boundary: RecoveryTransactionBoundary = {
    async transaction(run) {
      return run({
        async query(sql, params) {
          assert.match(sql, /status = 'FISCALIZING'/)
          assert.deepEqual(params, ['S1', 'T1', 'D1'])
          if (state !== 'FISCALIZING') return { rows: [] }
          state = 'FISCALIZED'
          return { rows: [{ id: 'T1' }] }
        },
        async recordRecoveryAudit(audit) { audits.push(audit.idempotencyKey) },
      })
    },
  }
  assert.equal(await confirmTransactionFiscalizedAtomically(boundary, input), 'applied')
  assert.equal(await confirmTransactionFiscalizedAtomically(boundary, input), 'stale')
  assert.equal(audits.length, 1)
  assert.equal(audits[0], 'fiscal-status-recovery:T1:D1')
})

test('audit failure propagates so transactional caller can roll back', async () => {
  const boundary: RecoveryTransactionBoundary = {
    async transaction(run) {
      return run({
        async query() { return { rows: [{ id: 'T1' }] } },
        async recordRecoveryAudit() { throw new Error('audit failed') },
      })
    },
  }
  await assert.rejects(
    confirmTransactionFiscalizedAtomically(boundary, input), /audit failed/,
  )
})

test('unmatched conditional update never writes an audit', async () => {
  let audited = false
  const boundary: RecoveryTransactionBoundary = {
    async transaction(run) {
      return run({
        async query() { return { rows: [] } },
        async recordRecoveryAudit() { audited = true },
      })
    },
  }
  assert.equal(await confirmTransactionFiscalizedAtomically(boundary, input), 'stale')
  assert.equal(audited, false)
})
