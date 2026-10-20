import assert from 'node:assert/strict'
import test from 'node:test'
import { completeFiscalRecoveryAtomically } from '@/src/modules/fiscalization/infrastructure/unifiedRecoveryCompletion'
import type { UnifiedRecoveryBoundary } from '@/src/modules/fiscalization/infrastructure/unifiedRecoveryCompletion'

const assessment = {
  countryCode: 'TZ' as const, stationId: 'S1', documentId: 'D1',
  outcome: 'confirmed' as const, canMarkFiscalized: true,
  canAutomaticallyResubmit: false as const, reason: 'Confirmed',
  decision: {
    countryCode: 'TZ' as const, transactionDocumentId: 'D1',
    resolution: { state: 'fiscalized' as const, documentId: 'D1',
      sourceStatus: 'FISCALIZED', reason: 'Confirmed', safeToResubmit: false as const },
    canMarkFiscalized: true, canAutomaticallyResubmit: false as const,
    requiresManualReview: false, reason: 'Confirmed',
  },
}
const input = { stationId: 'S1', transactionId: 'T1', documentId: 'D1', assessment }
const row = {
  id: 'R1', receipt_number: 'RC1',
  transaction_document_id: 'D1', latest_fiscal_event_id: 'E1',
  fiscalization_reference: 'REF1', event_id: 'E1',
  event_status: 'SUCCESS', event_reference: 'REF1',
  fiscal_data: { schemaVersion: 1, reference: 'REF1', receipt: { receiptNumber: 'RC1' } },
}

function boundary(options: { stale?: boolean; receipt?: boolean; printed?: boolean } = {}) {
  let committed = false
  let audited = false
  let printed = false
  const adapter: UnifiedRecoveryBoundary = {
    async transaction(run) {
      const outcome = await run({
        recovery: {
          async query() {
            return { rows: options.stale ? [] : [{
              id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED',
            }] }
          },
          async recordRecoveryAudit() { audited = true },
        },
        async linkedEventId() { return 'E1' },
        receiptRead: { async find() { return options.receipt === false ? null : row } },
        printing: {
          async isAutoPrintEnabled() { return true },
          async ensurePrintJob() {
            printed = true
            return { idempotencyVerified: options.printed !== false }
          },
        },
      })
      committed = true
      return outcome
    },
  }
  return { adapter, state: () => ({ committed, audited, printed }) }
}

test('applied recovery commits only after linked event, receipt and print pass', async () => {
  const fake = boundary()
  assert.deepEqual(await completeFiscalRecoveryAtomically(fake.adapter, input), { outcome: 'applied' })
  assert.deepEqual(fake.state(), { committed: true, audited: true, printed: true })
})

test('missing receipt blocks transaction completion and rollback is required', async () => {
  const fake = boundary({ receipt: false })
  const result = await completeFiscalRecoveryAtomically(fake.adapter, input)
  assert.equal(result.outcome, 'blocked')
  assert.equal(fake.state().committed, false)
  assert.equal(fake.state().printed, false)
})

test('unverified print idempotency blocks commit even after audit', async () => {
  const fake = boundary({ printed: false })
  assert.equal((await completeFiscalRecoveryAtomically(fake.adapter, input)).outcome, 'blocked')
  assert.equal(fake.state().committed, false)
})

test('stale update does not audit or print', async () => {
  const fake = boundary({ stale: true })
  assert.equal((await completeFiscalRecoveryAtomically(fake.adapter, input)).outcome, 'stale')
  assert.equal(fake.state().audited, false)
  assert.equal(fake.state().printed, false)
})

test('transaction failures are not disguised as safe blockers', async () => {
  const adapter: UnifiedRecoveryBoundary = {
    async transaction() { throw new Error('database unavailable') },
  }
  await assert.rejects(completeFiscalRecoveryAtomically(adapter, input), /database unavailable/)
})

test('missing station printing configuration fails and cannot commit recovery', async () => {
  let committed = false
  const adapter: UnifiedRecoveryBoundary = {
    async transaction(run) {
      const result = await run({
        recovery: {
          async query() {
            return { rows: [{ id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED' }] }
          },
          async recordRecoveryAudit() {},
        },
        async linkedEventId() { return 'E1' },
        receiptRead: { async find() { return row } },
        printing: {
          async isAutoPrintEnabled() { throw new Error('Station auto-print configuration is unavailable') },
          async ensurePrintJob() { throw new Error('Print must not be attempted') },
        },
      })
      committed = true
      return result
    },
  }
  await assert.rejects(completeFiscalRecoveryAtomically(adapter, input), /configuration is unavailable/)
  assert.equal(committed, false)
})

test('invalid newly inserted print result blocks unified transaction', async () => {
  const fake = boundary({ printed: false })
  assert.equal((await completeFiscalRecoveryAtomically(fake.adapter, input)).outcome, 'blocked')
  assert.equal(fake.state().committed, false)
})
