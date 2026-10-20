import assert from 'node:assert/strict'
import test from 'node:test'
import { completeFiscalRecoveryAtomically } from '@/src/modules/fiscalization/infrastructure/unifiedRecoveryCompletion'
import type { UnifiedRecoveryBoundary } from '@/src/modules/fiscalization/infrastructure/unifiedRecoveryCompletion'
import type { FiscalRecoveryAssessment } from '@/src/modules/fiscalization/application/statusRecoveryService'

const assessment: FiscalRecoveryAssessment = {
  countryCode: 'TZ', stationId: 'S1', documentId: 'D1',
  outcome: 'confirmed', canMarkFiscalized: true, canAutomaticallyResubmit: false,
  reason: 'Confirmed',
  decision: {
    countryCode: 'TZ', transactionDocumentId: 'D1', canMarkFiscalized: true,
    resolution: { state: 'fiscalized', documentId: 'D1', sourceStatus: 'FISCALIZED',
      reason: 'Confirmed', safeToResubmit: false },
    canAutomaticallyResubmit: false, requiresManualReview: false, reason: 'Confirmed',
  },
}
const candidate = {
  receiptNumber: 'RC1', transactionDocumentId: 'D1', fiscalEventId: 'E1',
  fiscalReference: 'REF1', plainTextContent: 'Official fiscal receipt', renderVersion: 1,
  fiscalData: { schemaVersion: 1, reference: 'REF1', receipt: {
    country: 'TZ', receiptNumber: 'RC1', fiscalVerificationCode: 'VERIFY',
  } },
}
const row = {
  id: 'R1', receipt_number: 'RC1', fiscal_data: candidate.fiscalData,
  transaction_document_id: 'D1', latest_fiscal_event_id: 'E1',
  fiscalization_reference: 'REF1', event_id: 'E1', event_status: 'SUCCESS',
  event_reference: 'REF1',
}
const input = { stationId: 'S1', transactionId: 'T1', documentId: 'D1', assessment, receiptCandidate: candidate }

function fake(mode: 'created' | 'blocked' | 'existing') {
  let inserted = 0
  let printed = 0
  let committed = false
  const boundary: UnifiedRecoveryBoundary = {
    async transaction(run) {
      const result = await run({
        recovery: {
          async query() { return { rows: [{
            id: 'T1', station_id: 'S1', fiscal_document_id: 'D1', status: 'FISCALIZED',
          }] } },
          async recordRecoveryAudit() {},
        },
        async linkedEventId() { return 'E1' },
        receiptRead: { async find() {
          return mode === 'existing' || (mode === 'created' && inserted) ? row : null
        } },
        async insertMissingReceipt() {
          inserted++
          return mode === 'blocked'
            ? { kind: 'blocked' as const, reason: 'Fiscal evidence incomplete' }
            : { kind: 'created' as const, receiptId: 'R1' }
        },
        printing: {
          async isAutoPrintEnabled() { return true },
          async ensurePrintJob() { printed++; return { idempotencyVerified: true } },
        },
      })
      committed = true
      return result
    },
  }
  return { boundary, state: () => ({ inserted, printed, committed }) }
}

test('missing receipt is inserted, reread, verified, then printed in one transaction', async () => {
  const x = fake('created')
  assert.deepEqual(await completeFiscalRecoveryAtomically(x.boundary, input), { outcome: 'applied' })
  assert.deepEqual(x.state(), { inserted: 1, printed: 1, committed: true })
})

test('blocked candidate rolls back and never prints', async () => {
  const x = fake('blocked')
  assert.equal((await completeFiscalRecoveryAtomically(x.boundary, input)).outcome, 'blocked')
  assert.deepEqual(x.state(), { inserted: 1, printed: 0, committed: false })
})

test('existing verified receipt is reused without insertion', async () => {
  const x = fake('existing')
  assert.equal((await completeFiscalRecoveryAtomically(x.boundary, input)).outcome, 'applied')
  assert.deepEqual(x.state(), { inserted: 0, printed: 1, committed: true })
})
