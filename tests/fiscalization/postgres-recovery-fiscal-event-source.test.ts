import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRecoveryEventSource } from '@/src/modules/fiscalization/infrastructure/postgresRecoveryFiscalEventSource'

const expected = { eventId: 'E1', documentId: 'D1', reference: 'REF1' }
const source = {
  id: 'E1', documentId: 'D1', reference: 'REF1',
  status: 'SUCCESS', engine: 'proxy', responsePayload: { receipt: { receiptNumber: 'RC1' } },
}

test('correlated non-recovery fiscal event can proceed to country-specific interpretation', () => {
  assert.equal(assessRecoveryEventSource(source, expected).usable, true)
})

test('status-only synthetic audit is never authoritative receipt provenance', () => {
  assert.equal(assessRecoveryEventSource({
    ...source, engine: 'vpos-proxy-status-recovery',
  }, expected).usable, false)
})

test('reject unrelated, reference-free and response-free fiscal events', () => {
  for (const changed of [
    { id: 'E2' }, { documentId: 'D2' }, { reference: null },
    { reference: 'OTHER' }, { status: 'FAILED' },
    { responsePayload: null }, { responsePayload: 'SUCCESS' },
    { responsePayload: [] },
  ]) {
    assert.equal(assessRecoveryEventSource({ ...source, ...changed }, expected).usable, false)
  }
  assert.equal(assessRecoveryEventSource(null, expected).usable, false)
})
