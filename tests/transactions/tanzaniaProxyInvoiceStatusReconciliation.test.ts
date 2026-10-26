import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  classifyProxyInvoiceStatus,
  classifyKenyaProxyInvoiceStatus,
} from '@/src/modules/transactions/domain/kenya-proxy-invoice-status'

const read = (path: string) => readFileSync(path, 'utf8')

test('Tanzania approved fiscal response is eligible only when invoice status is terminal', () => {
  assert.equal(
    classifyProxyInvoiceStatus({
      documentId: '0804F44B57CF',
      documentNumber: '1',
      status: 'Approved',
      fiscalVerificationCode: 'SJZD3JOEVMFIDVTK',
      error: false,
    }),
    'approved',
  )
  for (const candidate of [
    { status: 'Fiscalizing', error: false },
    { status: 'Processing', error: false },
    { status: 'Pending', error: false },
    { status: 'Approved', error: true },
    { responseCode: '200', message: 'Success', error: false },
  ]) assert.equal(classifyProxyInvoiceStatus(candidate), 'pending')
  assert.equal(classifyProxyInvoiceStatus({ status: 'Rejected' }), 'failed')
  assert.equal(classifyKenyaProxyInvoiceStatus({ status: 'Approved' }), 'approved')
})

test('Tanzania status endpoint accepts only exact matching original DocumentId', () => {
  const source = read('src/shared/proxy/client.ts')
  assert.match(source, /country === 'TZ'/)
  assert.match(source, /'\/api\/tanzania\/invoices\/status'/)
  assert.match(source, /'\/api\/invoices\/status'/)
  assert.match(source, /query: \{ DocumentId: requestedId \}/)
  assert.match(source, /matches\.length !== 1/)
  assert.match(source, /requestedId\.toUpperCase\(\)/)
  assert.match(source, /timeoutMs: 10_000/)
})

test('manual Tanzania status check is authorized and limited to the authenticated station', () => {
  const api = read('app/api/transactions/reconcile-tanzania-status/route.ts')
  const command = read('src/modules/transactions/application/commands/reconcile-tanzania-fiscalizing-transactions.ts')
  const worker = read('src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts')
  assert.match(api, /defineMutationRoute/)
  assert.match(api, /roles: \['manager', 'administrator', 'field_engineer'\]/)
  assert.match(api, /isUuid\(id\)/)
  assert.match(api, /ids\.length > 100/)
  assert.match(api, /stationId: user\.stationId/)
  assert.match(command, /reconcileTanzaniaFiscalizingTransactions/)
  assert.match(worker, /route\.country !== 'TZ'/)
  assert.match(worker, /mode: 'tanzania-document-status'/)
  assert.match(worker, /t\.status = 'FISCALIZING'/)
  assert.match(worker, /t\.id = ANY\(\$3::uuid\[\]\)/)
  assert.match(worker, /FOR UPDATE/)
  assert.match(worker, /latest_fiscal_event_id/)
  assert.match(worker, /if \(!fiscalizedTransaction\) continue/)
})

test('Tanzania and Kenya continue to share unattended 10-minute reconciliation', () => {
  const worker = read('src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts')
  const admin = read('components/transactions/NonFiscalizedTransactionsPageClient.tsx')
  const manager = read('components/transactions/ManagerNonFiscalizedTable.tsx')

  assert.match(worker, /countryDocumentStatusIntervalMs = 10 \* 60 \* 1000/)
  assert.match(worker, /lastCountryDocumentStatusAt/)
  assert.match(worker, /route\.country === 'TZ'/)
  assert.match(worker, /'tanzania-document-status'/)
  assert.match(worker, /'kenya-document-status'/)
  assert.match(worker, /excludeTransactionIds: new Set\(inFlight\.keys\(\)\)/)
  assert.match(admin, /'\/api\/transactions\/reconcile-tanzania-status'/)
  assert.match(admin, /onRefresh=\{manualRefresh\}/)
  assert.match(manager, /'\/api\/transactions\/reconcile-tanzania-status'/)
  assert.match(manager, /isKenya \|\| isTanzania/)
})
