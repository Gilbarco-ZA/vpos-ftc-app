import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileAndConfirmFiscalTransaction } from '@/src/modules/fiscalization/application/trustedRecoveryWorkflow'
import type { FiscalStatusLookupPort } from '@/src/modules/fiscalization/application/statusRecoveryService'
import type { RecoveryTransactionBoundary } from '@/src/modules/fiscalization/infrastructure/transactionalRecoveryAdapter'

const args = { country: 'TZ', stationId: 'S1', transactionId: 'T1', documentId: 'D1' }

test('status lookup confirmation is required before transaction transition', async () => {
  let writes = 0
  const boundary: RecoveryTransactionBoundary = {
    async transaction(run) {
      return run({
        async query() { writes++; return { rows: [{ id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' }] } },
        async recordRecoveryAudit() {},
      })
    },
  }
  const lookup: FiscalStatusLookupPort = {
    async lookup() { return { kind: 'response', response: {
      error: false, documentId: 'D1', status: 'FISCALIZED',
    } } },
  }
  const result = await reconcileAndConfirmFiscalTransaction(lookup, boundary, args)
  assert.equal(result.outcome, 'applied')
  assert.equal(writes, 1)
  assert.equal(result.assessment.canAutomaticallyResubmit, false)
})

test('mismatched proxy response never reaches persistence', async () => {
  let invoked = false
  const boundary: RecoveryTransactionBoundary = {
    async transaction() { invoked = true; throw new Error('must not persist') },
  }
  for (const response of [
    { error: false, documentId: 'OTHER', status: 'FISCALIZED' },
    { error: false, documentId: 'D1', status: 'PENDING' },
    { error: true, documentId: 'D1', status: 'FAILED' },
    { error: true, documentId: 'D1', status: 'FISCALIZED' },
    { error: true, documentId: 'D1', status: 'SUCCESS' },
  ]) {
    const lookup: FiscalStatusLookupPort = {
      async lookup() { return { kind: 'response', response } },
    }
    const result = await reconcileAndConfirmFiscalTransaction(lookup, boundary, args)
    assert.equal(result.outcome, 'unresolved')
  }
  assert.equal(invoked, false)
})

test('transport failure and malformed transaction identity fail closed', async () => {
  let invoked = false
  const boundary: RecoveryTransactionBoundary = {
    async transaction() { invoked = true; throw new Error('unexpected') },
  }
  const lookup: FiscalStatusLookupPort = {
    async lookup() { return { kind: 'transport-error', reason: 'offline' } },
  }
  const result = await reconcileAndConfirmFiscalTransaction(lookup, boundary, args)
  assert.equal(result.outcome, 'unresolved')
  await assert.rejects(reconcileAndConfirmFiscalTransaction(lookup, boundary, {
    ...args, transactionId: ' ',
  }), /Transaction ID is required/)
  assert.equal(invoked, false)
})
