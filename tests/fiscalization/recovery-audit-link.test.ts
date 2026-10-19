import assert from 'node:assert/strict'
import test from 'node:test'
import { persistAndLinkRecoveryAudit } from '@/src/modules/fiscalization/infrastructure/recoveryAuditLink'

const input = {
  stationId: 'S1', transactionId: 'T1', documentId: 'D1',
  idempotencyKey: 'recovery:T1:D1', observedStatus: 'FISCALIZED',
}

test('audit links recorded event to its transaction', async () => {
  const steps: string[] = []
  await persistAndLinkRecoveryAudit({
    async persist() { steps.push('persist'); return { eventId: 'E1', summary: { status: 'SUCCESS' } } },
    async link(audit) { steps.push('link'); assert.equal(audit.eventId, 'E1'); return 1 },
  }, input)
  assert.deepEqual(steps, ['persist', 'link'])
})

test('audit refuses absent and multiple links', async () => {
  for (const count of [0, 2]) {
    await assert.rejects(persistAndLinkRecoveryAudit({
      async persist() { return { eventId: 'E1', summary: null } },
      async link() { return count },
    }, input), /could not be bound/)
  }
})

test('missing evidence and audit failures never count as success', async () => {
  await assert.rejects(persistAndLinkRecoveryAudit({
    async persist() { throw new Error('audit failed') },
    async link() { return 1 },
  }, input), /audit failed/)
  await assert.rejects(persistAndLinkRecoveryAudit({
    async persist() { return { eventId: 'E1', summary: null } },
    async link() { return 1 },
  }, { ...input, documentId: '' }), /required/)
})
