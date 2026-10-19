import assert from 'node:assert/strict'
import test from 'node:test'
import { assessFiscalStatusRecovery } from '@/src/modules/fiscalization/application/statusRecoveryService'
import type { FiscalStatusLookupPort } from '@/src/modules/fiscalization/application/statusRecoveryService'

test('correlated fiscal status yields advisory confirmation without mutating anything', async () => {
  const calls: string[] = []
  const port: FiscalStatusLookupPort = { async lookup(request) {
    calls.push(request.countryCode + ':' + request.stationId + ':' + request.documentId)
    return { kind: 'response', response: {
      error: false, documentId: request.documentId, details: { isFiscalized: true },
    } }
  } }
  const result = await assessFiscalStatusRecovery(port, {
    country: 'TZA', stationId: ' S1 ', documentId: ' DOC-1 ',
  })
  assert.deepEqual(calls, ['TZ:S1:DOC-1'])
  assert.equal(result.outcome, 'confirmed')
  assert.equal(result.canMarkFiscalized, true)
  assert.equal(result.canAutomaticallyResubmit, false)
})

test('mismatched status identifier stays unresolved', async () => {
  const port: FiscalStatusLookupPort = { async lookup() {
    return { kind: 'response', response: {
      error: false, documentId: 'DIFFERENT', status: 'FISCALIZED',
    } }
  } }
  const result = await assessFiscalStatusRecovery(port, {
    country: 'KE', stationId: 'S1', documentId: 'DOC-1',
  })
  assert.equal(result.outcome, 'unresolved')
  assert.equal(result.canMarkFiscalized, false)
})

test('unavailable, transport errors and throws do not authorize resubmission', async () => {
  const ports: FiscalStatusLookupPort[] = [
    { async lookup() { return { kind: 'unavailable', reason: 'not configured' } } },
    { async lookup() { return { kind: 'transport-error', reason: 'timeout' } } },
    { async lookup() { throw new Error('timeout') } },
  ]
  for (const port of ports) {
    const result = await assessFiscalStatusRecovery(port, {
      country: 'TZ', stationId: 'S1', documentId: 'DOC-1',
    })
    assert.equal(result.canMarkFiscalized, false)
    assert.equal(result.canAutomaticallyResubmit, false)
  }
})

test('invalid inputs fail before calling the status lookup port', async () => {
  let count = 0
  const port: FiscalStatusLookupPort = { async lookup() {
    count += 1
    return { kind: 'unavailable', reason: 'no transport' }
  } }
  await assert.rejects(assessFiscalStatusRecovery(port, {
    country: 'TZ', stationId: '', documentId: 'DOC',
  }), /required/)
  await assert.rejects(assessFiscalStatusRecovery(port, {
    country: 'XX', stationId: 'S1', documentId: 'DOC',
  }), /Unsupported/)
  assert.equal(count, 0)
})
