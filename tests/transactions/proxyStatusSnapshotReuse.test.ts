import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildFiscalizationCompatibilitySummary } from '@/src/modules/transactions/domain/fiscalization-event'
import { mergeChangedProxyInvoiceStatus } from '@/src/modules/transactions/domain/proxy-invoice-status-evidence'

const read = (path: string) => readFileSync(path, 'utf8')

const original = {
  documentId: '0804F44B57CF',
  status: 'Queued',
  message: 'Original submission received',
  requestId: '123',
}

test('an unchanged GET response does not rewrite the existing fiscalization evidence', () => {
  const incoming = {
    documentId: '0804F44B57CF',
    status: 'Pending',
    message: 'Awaiting authority',
    lastStatusTime: '2026-10-26T15:00:00Z',
    error: false,
  }
  const first = mergeChangedProxyInvoiceStatus(original, incoming)
  assert.deepEqual(first, { ...original, statusLookup: incoming })
  assert.equal(
    mergeChangedProxyInvoiceStatus(first, {
      ...incoming,
      lastStatusTime: '2026-10-26T15:10:00Z',
    }),
    null,
  )
  assert.equal(mergeChangedProxyInvoiceStatus(first, { ...incoming }), null)
})

test('changing a status or a fiscal field replaces the same snapshot, not appending poll history', () => {
  const pending = {
    documentId: '0804F44B57CF',
    status: 'Pending',
    message: 'Queued',
    lastStatusTime: '2026-10-26T15:00:00Z',
  }
  const first = mergeChangedProxyInvoiceStatus(original, pending)
  const processing = { ...pending, status: 'Processing' }
  const second = mergeChangedProxyInvoiceStatus(first, processing)
  assert.ok(second && typeof second === 'object' && !Array.isArray(second))
  const evidence = second as Record<string, unknown>
  assert.equal(evidence.status, original.status)
  assert.equal(evidence.requestId, original.requestId)
  assert.deepEqual(evidence.statusLookup, processing)
  assert.equal('statusHistory' in evidence, false)
  assert.equal('polls' in evidence, false)

  const changedCode = {
    ...processing,
    revenueAuthorityReference: 'KRA-123',
  }
  const third = mergeChangedProxyInvoiceStatus(second, changedCode)
  assert.deepEqual(
    (third as Record<string, unknown>).statusLookup,
    changedCode,
  )
  assert.equal(mergeChangedProxyInvoiceStatus(third, changedCode), null)
})

test('invalid or unavailable invoice statuses never replace existing evidence', () => {
  assert.equal(mergeChangedProxyInvoiceStatus(original, null), null)
  assert.equal(mergeChangedProxyInvoiceStatus(original, {}), null)
  assert.equal(
    mergeChangedProxyInvoiceStatus(original, { documentId: '0804F44B57CF' }),
    null,
  )
})

test('sensitive fields in stored snapshots remain sanitized', () => {
  const evidence = mergeChangedProxyInvoiceStatus(original, {
    status: 'Pending',
    documentId: '0804F44B57CF',
    accessToken: 'do-not-store',
  }) as Record<string, unknown>
  assert.equal(
    (evidence.statusLookup as Record<string, unknown>).accessToken,
    '[REDACTED]',
  )
})

test('compatibility summary reflects the latest nonterminal snapshot', () => {
  const summary = buildFiscalizationCompatibilitySummary({
    eventId: 'event-1',
    status: 'PENDING',
    engine: 'proxy',
    transport: 'proxy',
    responsePayload: {
      status: 'Queued',
      message: 'Original submission',
      documentId: '0804F44B57CF',
      statusLookup: {
        status: 'Processing',
        message: 'Awaiting authority',
      },
    },
  })
  assert.equal(summary.responseStatus, 'Processing')
  assert.equal(summary.message, 'Awaiting authority')
  assert.equal(summary.status, 'PENDING')
})

test('GET reconciliation retains one event ID, preserves pending status and skips unchanged writes', () => {
  const worker = read('src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts')
  assert.match(worker, /mergeChangedProxyInvoiceStatus\(stored, matched\) === null/)
  assert.match(worker, /if \(!input\.eventId\) return false/)
  assert.match(worker, /current\?\.status !== 'FISCALIZING'/)
  assert.match(worker, /existing\.status !== 'PENDING'/)
  assert.match(worker, /existingEventId: input\.eventId/)
  assert.match(worker, /status: 'PENDING'/)
  assert.match(worker, /FOR UPDATE/)
  assert.match(worker, /SET fiscalization_response = \$3/)
  assert.match(worker, /statusLookup = matched/)
  assert.match(worker, /classifyProxyInvoiceStatus\(matched\)/)
  assert.match(worker, /directOutcome === 'pending'/)
  assert.doesNotMatch(
    worker.slice(
      worker.indexOf('async function updatePendingProxyInvoiceStatus'),
      worker.indexOf('async function reconcilePendingProxyFiscalizations'),
    ),
    /INSERT INTO fiscalization_events|INSERT INTO transactions/,
  )
})
