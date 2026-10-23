import assert from 'node:assert/strict'
import test from 'node:test'
import { assessFiscalStatusRecovery } from '@/src/modules/fiscalization/application/statusRecoveryService'
import {
  createSwaggerStatusLookupPort,
} from '@/src/modules/fiscalization/infrastructure/swaggerStatusLookupPort'
import type {
  StatusHttpRequest, StatusHttpTransport,
} from '@/src/modules/fiscalization/infrastructure/swaggerStatusLookupPort'

test('Tanzania uses GET /api/tanzania/invoices/status with precise DocumentId', async () => {
  const calls: StatusHttpRequest[] = []
  const transport: StatusHttpTransport = { async request(request) {
    calls.push(request)
    return { ok: true, status: 200, body: {
      error: false, invoices: [
        { documentId: 'OTHER', status: 'FISCALIZED', error: false },
        { documentId: 'INV-1', status: 'FISCALIZED', error: false },
      ],
    } }
  } }
  const result = await assessFiscalStatusRecovery(createSwaggerStatusLookupPort(transport), {
    country: 'TZ', stationId: 'SITE-1', documentId: 'INV-1',
  })
  assert.deepEqual(calls, [{ stationId: 'SITE-1', method: 'GET',
    path: '/api/tanzania/invoices/status', query: { DocumentId: 'INV-1' } }])
  assert.equal(result.outcome, 'confirmed')
  assert.equal(result.canMarkFiscalized, true)
  assert.equal(result.canAutomaticallyResubmit, false)
})

test('Kenya routes through general invoice status API', async () => {
  let path = ''
  const port = createSwaggerStatusLookupPort({ async request(request) {
    path = request.path
    return { ok: true, status: 200, body: {
      error: false, invoices: [{ documentId: 'A', status: 'FISCALIZING', error: false }],
    } }
  } })
  const result = await assessFiscalStatusRecovery(port, {
    country: 'KEN', stationId: 'SITE-1', documentId: 'A',
  })
  assert.equal(path, '/api/invoices/status')
  assert.equal(result.canMarkFiscalized, false)
  assert.equal(result.outcome, 'unresolved')
})

test('HTTP failure, malformed responses and thrown transport failures remain unresolved', async () => {
  const transports: StatusHttpTransport[] = [
    { async request() { return { ok: false, status: 503, body: null } } },
    { async request() { return { ok: true, status: 200, body: 'invalid' } } },
    { async request() { throw new Error('no connection') } },
  ]
  for (const transport of transports) {
    const result = await assessFiscalStatusRecovery(createSwaggerStatusLookupPort(transport), {
      country: 'TZ', stationId: 'SITE-1', documentId: 'A',
    })
    assert.equal(result.canMarkFiscalized, false)
    assert.equal(result.canAutomaticallyResubmit, false)
  }
})

test('lookup never invokes transport when station is empty', async () => {
  let called = false
  const port = createSwaggerStatusLookupPort({ async request() {
    called = true
    return { ok: true, status: 200, body: null }
  } })
  const result = await port.lookup({ countryCode: 'TZ', stationId: ' ', documentId: 'A' })
  assert.equal(result.kind, 'unavailable')
  assert.equal(called, false)
})
