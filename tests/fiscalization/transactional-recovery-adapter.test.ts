import assert from 'node:assert/strict'
import test from 'node:test'
import {
  confirmTransactionFiscalizedAtomically,
} from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryAdapter'
import type {
  RecoveryTransactionBoundary,
} from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryAdapter'

const assessment = {
  countryCode: 'TZ' as const, stationId: 'S1', documentId: 'D1',
  outcome: 'confirmed' as const, canMarkFiscalized: true,
  canAutomaticallyResubmit: false as const, reason: 'Confirmed',
  decision: {
    countryCode: 'TZ' as const, transactionDocumentId: 'D1',
    resolution: {
      state: 'fiscalized' as const, documentId: 'D1',
      sourceStatus: 'FISCALIZED', reason: 'Confirmed',
      safeToResubmit: false as const,
    },
    canMarkFiscalized: true, canAutomaticallyResubmit: false as const,
    requiresManualReview: false, reason: 'Confirmed',
  },
}
const input = {
  stationId: 'S1', transactionId: 'T1', documentId: 'D1', assessment,
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
          return { rows: [{ id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' }] }
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
        async query() { return { rows: [{ id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' }] } },
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

test('unverified and mismatched assessments never start a database transaction', async () => {
  let started = false
  const boundary: RecoveryTransactionBoundary = {
    async transaction() { started = true; throw new Error('Must not start') },
  }
  const variants = [
    { ...assessment, outcome: 'unresolved' as const },
    { ...assessment, canMarkFiscalized: false },
    { ...assessment, stationId: 'OTHER' },
    { ...assessment, documentId: 'OTHER' },
    { ...assessment, decision: { ...assessment.decision, countryCode: 'KE' as const } },
    { ...assessment, decision: { ...assessment.decision,
      resolution: { ...assessment.decision.resolution, documentId: 'OTHER' } } },
    { ...assessment, decision: { ...assessment.decision,
      resolution: { ...assessment.decision.resolution, state: 'processing' as const } } },
  ]
  for (const invalid of variants) {
    await assert.rejects(
      confirmTransactionFiscalizedAtomically(boundary, { ...input, assessment: invalid }),
      /Correlated fiscal status confirmation is required/,
    )
  }
  assert.equal(started, false)
})

test('unexpected UPDATE identities and multiple rows reject without auditing', async () => {
  for (const rows of [
    [{ id: 'OTHER', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' }],
    [{ id: 'T1', station_id: 'OTHER', fiscal_document_id: 'D1', status: 'FISCALIZED' }],
    [{ id: 'T1', station_id: 'S1', fiscal_document_id: 'OTHER', status: 'FISCALIZED' }],
    [{ id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FAILED' }],
    [
      { id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' },
      { id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' },
    ],
  ]) {
    let audited = false
    const boundary: RecoveryTransactionBoundary = {
      async transaction(run) {
        return run({
          async query() { return { rows } },
          async recordRecoveryAudit() { audited = true },
        })
      },
    }
    await assert.rejects(
      confirmTransactionFiscalizedAtomically(boundary, input),
      /unexpected transaction identity/,
    )
    assert.equal(audited, false)
  }
})
