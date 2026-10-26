import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { classifyKenyaProxyInvoiceStatus } from '@/src/modules/transactions/domain/kenya-proxy-invoice-status'

const read = (path: string) => readFileSync(path, 'utf8')

test('Kenya Approved invoice becomes eligible for fiscalization reconciliation', () => {
  assert.equal(
    classifyKenyaProxyInvoiceStatus({
      documentId: '0804F44B57CF',
      documentNumber: '1',
      status: 'Approved',
      fiscalVerificationCode: 'SJZD3JOEVMFIDVTK',
      error: false,
    }),
    'approved',
  )
  assert.equal(
    classifyKenyaProxyInvoiceStatus({ status: 'Approved', error: true }),
    'pending',
  )
})

test('an HTTP success envelope or in-progress response never finalizes an invoice', () => {
  for (const value of [
    null,
    {},
    { responseCode: '200', message: 'Success', error: false },
    { status: 'Pending', error: false },
    { status: 'Fiscalizing', error: false },
    { status: 'Queued', error: false },
    { status: 'Processing', error: false },
  ]) {
    assert.equal(classifyKenyaProxyInvoiceStatus(value), 'pending')
  }
  assert.equal(
    classifyKenyaProxyInvoiceStatus({ status: 'Rejected', error: false }),
    'failed',
  )
})

test('DocumentId status lookup uses configured proxy URL and validates invoice identity', () => {
  const client = read('src/shared/proxy/client.ts')
  assert.match(client, /'\/api\/invoices\/status'/)
  assert.match(client, /query: \{ DocumentId: requestedId \}/)
  assert.match(client, /matches\.length !== 1/)
  assert.match(client, /requestedId\.toUpperCase\(\)/)
  assert.match(client, /timeoutMs: 10_000/)
})

test('manual refresh uses CSRF and restricts reconciliation to station-scoped fiscalizing records', () => {
  const route = read('app/api/transactions/reconcile-kenya-status/route.ts')
  const worker = read('src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts')
  const admin = read('components/transactions/NonFiscalizedTransactionsPageClient.tsx')
  const manager = read('components/transactions/ManagerNonFiscalizedTable.tsx')

  assert.match(route, /defineMutationRoute/)
  assert.match(route, /roles: \['manager', 'administrator', 'field_engineer'\]/)
  assert.match(route, /stationId: user\.stationId/)
  assert.match(route, /isUuid\(id\)/)
  assert.match(worker, /\['KE', 'KEN', 'KENYA'\]\.includes/)
  assert.match(worker, /t\.status = 'FISCALIZING'/)
  assert.match(worker, /t\.id = ANY\(\$3::uuid\[\]\)/)
  assert.match(worker, /FOR UPDATE/)
  assert.match(worker, /latest_fiscal_event_id/)
  assert.match(admin, /onRefresh=\{manualRefresh\}/)
  assert.match(manager, /Refresh fiscalizing status/)
})

test('ten-minute checks run from the independent proxy worker', () => {
  const worker = read('src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts')
  assert.match(worker, /countryDocumentStatusIntervalMs = 10 \* 60 \* 1000/)
  assert.match(worker, /lastCountryDocumentStatusAt/)
  assert.match(worker, /mode: 'kenya-document-status'/)
  assert.match(worker, /excludeTransactionIds: new Set\(inFlight\.keys\(\)\)/)
  assert.match(worker, /if \(!fiscalizedTransaction\) continue/)
})
