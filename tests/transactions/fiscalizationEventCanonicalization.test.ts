import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildFiscalizationCompatibilitySummary,
  hashFiscalPayload,
  parseFiscalizationCompatibilitySummary,
  sanitizeFiscalPayload,
} from '@/src/modules/transactions/domain/fiscalization-event'
import {
  getFiscalizationLegacyFallbackReadCount,
  resetFiscalizationLegacyFallbackReadCountForTests,
  resolveCanonicalFiscalizationPayload,
} from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-read-compat'

test('fiscal event payloads redact transport and payment secrets', () => {
  const sanitized = sanitizeFiscalPayload({
    reference: 'FISCAL-1',
    authorization: 'Bearer secret',
    nested: {
      accessToken: 'token-value',
      password: 'password-value',
      pan: '4111111111111111',
      receipt: {
        number: 'R-1',
        message: 'Authorization failed: Bearer abc.def.ghi',
      },
    },
  }) as any

  assert.equal(sanitized.reference, 'FISCAL-1')
  assert.equal(sanitized.authorization, '[REDACTED]')
  assert.equal(sanitized.nested.accessToken, '[REDACTED]')
  assert.equal(sanitized.nested.password, '[REDACTED]')
  assert.equal(sanitized.nested.pan, '[REDACTED]')
  assert.equal(sanitized.nested.receipt.number, 'R-1')
  assert.equal(
    sanitized.nested.receipt.message,
    'Authorization failed: Bearer [REDACTED]',
  )
})

test('transaction compatibility summaries stay bounded and event-backed', () => {
  const responsePayload = {
    status: 'SUCCESS',
    requestId: 'request-1',
    documentId: 'document-1',
    documentNumber: 'receipt-1',
    message: 'Completed',
    accessToken: 'secret-token',
    largePayload: 'x'.repeat(20_000),
  }
  const payloadHash = hashFiscalPayload({ responsePayload })
  const summary = buildFiscalizationCompatibilitySummary({
    eventId: 'event-1',
    status: 'SUCCESS',
    engine: 'KE',
    transport: 'proxy',
    responsePayload,
    payloadHash,
    occurredAt: '2026-07-21T10:00:00.000Z',
  })

  const encoded = JSON.stringify(summary)
  assert.equal(summary.source, 'fiscalization_event')
  assert.equal(summary.eventId, 'event-1')
  assert.equal(summary.requestId, 'request-1')
  assert.equal(summary.fiscalDocumentId, 'document-1')
  assert.equal(summary.reference, 'receipt-1')
  assert.equal(summary.payloadHash?.length, 64)
  assert.ok(Buffer.byteLength(encoded, 'utf8') < 2048)
  assert.doesNotMatch(encoded, /secret-token/)
  assert.doesNotMatch(encoded, /largePayload/)
  assert.deepEqual(parseFiscalizationCompatibilitySummary(encoded), summary)
})

test('event payloads take precedence and legacy fallback reads are counted', () => {
  resetFiscalizationLegacyFallbackReadCountForTests()

  const eventResult = resolveCanonicalFiscalizationPayload({
    eventResponsePayload: { documentNumber: 'EVENT-1' },
    legacyTransactionResponse: { documentNumber: 'LEGACY-1' },
  })
  assert.equal(eventResult.source, 'event')
  assert.deepEqual(eventResult.payload, { documentNumber: 'EVENT-1' })
  assert.equal(getFiscalizationLegacyFallbackReadCount(), 0)

  const legacyResult = resolveCanonicalFiscalizationPayload({
    legacyTransactionResponse: JSON.stringify({ documentNumber: 'LEGACY-1' }),
  })
  assert.equal(legacyResult.source, 'legacy_transaction')
  assert.deepEqual(legacyResult.payload, { documentNumber: 'LEGACY-1' })
  assert.equal(getFiscalizationLegacyFallbackReadCount(), 1)

  const summaryOnly = resolveCanonicalFiscalizationPayload({
    legacyTransactionResponse: JSON.stringify(
      buildFiscalizationCompatibilitySummary({
        eventId: 'event-2',
        status: 'PENDING',
        engine: 'KE',
        transport: 'proxy',
      }),
    ),
  })
  assert.equal(summaryOnly.source, 'none')
  assert.equal(summaryOnly.payload, null)
  assert.equal(getFiscalizationLegacyFallbackReadCount(), 1)
})

test('runtime writers use one fiscal event and a compact transaction summary', () => {
  const directRepository = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts',
    'utf8',
  )
  const statusRepository = readFileSync(
    'src/modules/transactions/infrastructure/persistence/transaction-status.repository.ts',
    'utf8',
  )
  const proxyWorker = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts',
    'utf8',
  )
  const failedCommand = readFileSync(
    'src/modules/transactions/application/commands/mark-transaction-failed.ts',
    'utf8',
  )

  assert.match(directRepository, /persistFiscalizationEventRepo/)
  assert.match(directRepository, /recorded\.compatibilitySummary/)
  assert.match(directRepository, /latestFiscalEventId: recorded\.event\.id/)
  assert.doesNotMatch(
    directRepository,
    /fiscalizationResponse:\s*fiscalResult\.rawResponse/,
  )
  assert.doesNotMatch(
    directRepository,
    /INSERT INTO fiscalization_events/,
  )

  assert.match(statusRepository, /fiscalEvent\?: FiscalizationEventWriteDetails/)
  assert.match(statusRepository, /withTransaction\(persist\)/)
  assert.match(statusRepository, /recorded\.compatibilitySummary/)

  assert.match(proxyWorker, /status: 'PENDING'/)
  assert.match(proxyWorker, /existingEventId: txn\?\.fiscal_event_id/)
  assert.match(proxyWorker, /latest_fiscal_event_id = \$5::uuid/)
  assert.match(proxyWorker, /resolveCanonicalFiscalizationPayload/)
  assert.doesNotMatch(proxyWorker, /fiscalizationResponse: res\.data/)
  assert.doesNotMatch(proxyWorker, /response: res\.data/)

  assert.match(failedCommand, /fiscalEventId/)
  assert.match(failedCommand, /fiscalizationSummary/)
  assert.doesNotMatch(failedCommand, /fiscalizationResponse:\s*input/)
})

test('receipt readers use the event-first compatibility contract', () => {
  const receiptBuilder = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts',
    'utf8',
  )
  const receiptRoute = readFileSync('app/api/receipts/route.ts', 'utf8')
  const receiptQuery = readFileSync(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
    'utf8',
  )
  assert.match(receiptBuilder, /resolveCanonicalFiscalizationPayload/)
  assert.match(receiptBuilder, /ORDER BY occurred_at DESC, created_at DESC/)
  assert.match(receiptRoute, /getReceiptRoutePayload/)
  assert.match(receiptQuery, /latestFiscalEvent/)
  assert.match(receiptQuery, /resolveCanonicalFiscalizationPayload/)
})

test('PostgreSQL migration supports pending proxy attempts and latest event lookup', () => {
  const postgres = readFileSync(
    'scripts/migrations/postgres/1258_fiscalization_event_canonical.sql',
    'utf8',
  )

  assert.match(postgres, /PENDING/)
  assert.match(postgres, /latest_fiscal_event_id/)
  assert.match(postgres, /transport/)
  assert.match(postgres, /schema_version/)
  assert.match(postgres, /payload_hash/)
  assert.match(postgres, /idempotency_key/)
  assert.match(postgres, /finalized_at/)

  assert.match(postgres, /idx_fisc_events_station_txn_latest/)
  assert.match(postgres, /ux_fisc_events_station_idempotency/)
  assert.doesNotMatch(
    postgres,
    /UPDATE transactions[\s\S]*SET fiscalization_response/i,
  )
})
