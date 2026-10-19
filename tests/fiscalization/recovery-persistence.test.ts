import assert from 'node:assert/strict'
import test from 'node:test'
import { applyConfirmedFiscalRecovery } from '@/src/modules/fiscalization/application/recoveryPersistence'
import type {
  FiscalRecoveryRecord, FiscalRecoveryPersistencePort, ConfirmFiscalizedCommand,
} from '@/src/modules/fiscalization/application/recoveryPersistence'
import type { FiscalRecoveryAssessment } from '@/src/modules/fiscalization/application/statusRecoveryService'

const confirmation: FiscalRecoveryAssessment = {
  countryCode: 'TZ', stationId: 'S1', documentId: 'INV1',
  outcome: 'confirmed', canMarkFiscalized: true, canAutomaticallyResubmit: false,
  reason: 'Confirmed',
  decision: {
    countryCode: 'TZ', transactionDocumentId: 'INV1',
    resolution: {
      state: 'fiscalized', documentId: 'INV1', sourceStatus: 'FISCALIZED',
      reason: 'Confirmed', safeToResubmit: false,
    },
    canMarkFiscalized: true, canAutomaticallyResubmit: false,
    requiresManualReview: false, reason: 'Confirmed',
  },
}

function memoryPort() {
  const record: FiscalRecoveryRecord = {
    stationId: 'S1', documentId: 'INV1', countryCode: 'TZ',
    state: 'fiscalizing', version: 1,
  }
  const audit: ConfirmFiscalizedCommand[] = []
  const port: FiscalRecoveryPersistencePort = {
    async read() { return { ...record } },
    async confirmFiscalized(command) {
      if (record.state === 'fiscalized') return { outcome: 'already-fiscalized' }
      if (record.version !== command.expectedVersion || record.state !== command.expectedState) {
        return { outcome: 'stale' }
      }
      record.state = 'fiscalized'
      record.version += 1
      audit.push(command)
      return { outcome: 'updated', version: record.version }
    },
  }
  return { port, record, audit }
}

test('matching confirmation changes a fiscalizing record exactly once', async () => {
  const { port, record, audit } = memoryPort()
  const first = await applyConfirmedFiscalRecovery(port, confirmation)
  const second = await applyConfirmedFiscalRecovery(port, confirmation)
  assert.equal(first.outcome, 'updated')
  assert.equal(second.outcome, 'already-fiscalized')
  assert.equal(record.state, 'fiscalized')
  assert.equal(audit.length, 1)
  assert.equal(audit[0].audit.documentId, 'INV1')
})

test('concurrent confirmations cannot both apply in compare-and-set port', async () => {
  const { port, audit } = memoryPort()
  const results = await Promise.all([
    applyConfirmedFiscalRecovery(port, confirmation),
    applyConfirmedFiscalRecovery(port, confirmation),
  ])
  assert.deepEqual(results.map(item => item.outcome).sort(), ['already-fiscalized', 'updated'])
  assert.equal(audit.length, 1)
})

test('unconfirmed status cannot access persistence', async () => {
  const port: FiscalRecoveryPersistencePort = {
    async read() { throw new Error('must not read') },
    async confirmFiscalized() { throw new Error('must not write') },
  }
  const result = await applyConfirmedFiscalRecovery(port, {
    ...confirmation, outcome: 'unresolved', canMarkFiscalized: false,
  })
  assert.equal(result.outcome, 'not-confirmed')
})

test('reject mismatched stored country and invalid version', async () => {
  for (const changes of [{ countryCode: 'KE' as const }, { version: -1 }]) {
    const port: FiscalRecoveryPersistencePort = {
      async read() {
        return { stationId: 'S1', documentId: 'INV1', countryCode: 'TZ',
          state: 'fiscalizing', version: 1, ...changes }
      },
      async confirmFiscalized() { throw new Error('must not write') },
    }
    const result = await applyConfirmedFiscalRecovery(port, confirmation)
    assert.equal(result.outcome, 'invalid-record')
  }
})
