import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInvoiceStatusEndpoint,
  parseInvoiceStatusCollection,
} from '@/src/modules/fiscalization/application/swaggerStatusContract'
import { assessFiscalStatusRecovery } from '@/src/modules/fiscalization/application/statusRecoveryService'

test('Swagger status route and DocumentId query differ by country', () => {
  assert.deepEqual(buildInvoiceStatusEndpoint('KEN', ' INV-1 '), {
    method: 'GET', path: '/api/invoices/status', query: { DocumentId: 'INV-1' },
  })
  assert.deepEqual(buildInvoiceStatusEndpoint('TZA', 'TZ-1'), {
    method: 'GET', path: '/api/tanzania/invoices/status', query: { DocumentId: 'TZ-1' },
  })
  assert.throws(() => buildInvoiceStatusEndpoint('ZA', 'A'), /Unsupported/)
  assert.throws(() => buildInvoiceStatusEndpoint('TZ', ' '), /required/)
})

test('select exactly one matching document, never the first unrelated invoice', () => {
  const result = parseInvoiceStatusCollection('INV-2', {
    responseCode: '200', error: false,
    invoices: [
      { documentId: 'INV-1', status: 'FISCALIZED', error: false },
      { documentId: 'INV-2', status: 'FISCALIZING', error: false },
    ],
  })
  assert.equal(result.kind, 'response')
  if (result.kind === 'response') {
    assert.equal(result.response.documentId, 'INV-2')
    assert.equal(result.response.status, 'FISCALIZING')
  }
})

test('invalid, failed, absent and duplicate collections fail closed', () => {
  const cases: unknown[] = [
    null,
    { error: true, invoices: [{ documentId: 'A', status: 'FISCALIZED', error: false }] },
    { error: false },
    { error: false, invoices: [] },
    { error: false, invoices: [{ documentId: 'B', status: 'FISCALIZED', error: false }] },
    { error: false, invoices: [{ documentId: 'A', status: 'FISCALIZED', error: false }, { documentId: 'A', status: 'FAILED', error: false }] },
    { error: false, invoices: [{ documentId: 'A', status: null }] },
    { error: false, invoices: [{ documentId: 'A', status: 'SUCCESS', error: true }] },
  ]
  for (const payload of cases) {
    assert.equal(parseInvoiceStatusCollection('A', payload).kind, 'unavailable')
  }
})

test('a matching collection result is assessed without allowing resubmission', async () => {
  const port = {
    async lookup() {
      return parseInvoiceStatusCollection('A', {
        error: false, invoices: [{ documentId: 'A', status: 'FISCALIZED', error: false }],
      })
    },
  }
  const result = await assessFiscalStatusRecovery(port, {
    country: 'TZ', stationId: 'S1', documentId: 'A',
  })
  assert.equal(result.outcome, 'confirmed')
  assert.equal(result.canAutomaticallyResubmit, false)
})

test('Swagger collection and row error flags must be explicitly boolean', () => {
  for (const payload of [
    { invoices: [{ documentId: 'A', status: 'FISCALIZED', error: false }] },
    { error: 'false', invoices: [{ documentId: 'A', status: 'FISCALIZED', error: false }] },
    { error: false, invoices: [{ documentId: 'A', status: 'FISCALIZED' }] },
    { error: false, invoices: [{ documentId: 'A', status: 'FISCALIZED', error: 'false' }] },
  ]) {
    assert.equal(parseInvoiceStatusCollection('A', payload).kind, 'unavailable')
  }
})
