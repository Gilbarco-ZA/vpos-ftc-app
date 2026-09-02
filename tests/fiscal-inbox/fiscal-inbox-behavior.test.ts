import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { FiscalInboxRepositoryPort } from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

import { createFiscalInboxStatusService } from '@/src/modules/fiscal-inbox/application/services/fiscal-inbox-status-service'
import { FiscalInboxStatusTransitionError } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-errors'
import {
  extractTransactionId,
  mapFiscalInboxListItem,
  normalizeFiscalInboxItem,
  normalizeFiscalInboxRows,
} from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.mapper'
import {
  getFiscalInboxTransactionId,
  presentFiscalInboxDetail,
  presentFiscalInboxItem,
  presentFiscalInboxListRows,
} from '@/src/modules/fiscal-inbox/presentation/presenters/fiscal-inbox.presenter'

const createRepository = (status: any = 'PENDING') => {
  const calls: Array<[string, unknown]> = []
  const repository = {
    getStatusSnapshot: async (input: unknown) => {
      calls.push(['snapshot', input])
      return status == null
        ? null
        : { id: 1, stationId: 'station-1', status, requestId: 'request-1' }
    },
    requeueById: async (input: unknown) => {
      calls.push(['requeue', input])
      return 1
    },
    markFailedById: async (input: unknown) => {
      calls.push(['failed', input])
      return 1
    },
    markDeadById: async (input: unknown) => {
      calls.push(['dead', input])
      return 1
    },
    markProcessedById: async (input: unknown) => {
      calls.push(['processed', input])
      return 1
    },
  } as unknown as FiscalInboxRepositoryPort
  return { repository, calls }
}

describe('fiscal inbox status service', () => {
  it('delegates every supported transition after normalizing the status', async () => {
    const { repository, calls } = createRepository(' failed ')
    const service = createFiscalInboxStatusService({ repository })
    const base = { id: 7, stationId: 'station-1' }

    assert.equal(await service.requeue(base), 1)
    assert.equal(await service.markFailed({ ...base, errorText: 'retry' }), 1)
    assert.equal(await service.markDead({ ...base, errorText: 'terminal' }), 1)
    assert.equal(await service.markProcessed(base), 1)

    assert.deepEqual(
      calls.map(([name]) => name),
      [
        'snapshot',
        'requeue',
        'snapshot',
        'failed',
        'snapshot',
        'dead',
        'snapshot',
        'processed',
      ],
    )
  })

  it('returns null without mutation when the row no longer exists', async () => {
    const { repository, calls } = createRepository(null)
    const service = createFiscalInboxStatusService({ repository })

    assert.equal(
      await service.markProcessed({ id: 99, stationId: 'station-1' }),
      null,
    )
    assert.deepEqual(calls.map(([name]) => name), ['snapshot'])
  })

  it('fails closed when the persisted status is unknown', async () => {
    const { repository, calls } = createRepository('CORRUPT')
    const service = createFiscalInboxStatusService({ repository })

    await assert.rejects(
      service.requeue({ id: 1, stationId: 'station-1' }),
      (error: unknown) => {
        assert.ok(error instanceof FiscalInboxStatusTransitionError)
        assert.match((error as Error).message, /CORRUPT -> UNKNOWN/)
        return true
      },
    )
    assert.deepEqual(calls.map(([name]) => name), ['snapshot'])
  })
})

describe('fiscal inbox mapping and presentation', () => {
  const databaseRow = {
    id: '12',
    station_id: 'station-1',
    topic: 'fiscal',
    status: 'FAILED',
    request_id: 'request-12',
    attempt_count: '3',
    next_attempt_at: '2026-07-22T10:00:00Z',
    received_at: '2026-07-21T10:00:00Z',
    processed_at: null,
    dead_at: null,
    resolved_at: '2026-07-21T11:00:00Z',
    error_text: 'network',
    related_transaction_id: 'transaction-12',
    related_transaction_status: 'FISCALIZATION_FAILED',
    message_json: { transactionId: 'transaction-from-message' },
  }

  it('maps database rows into typed list items', () => {
    assert.deepEqual(mapFiscalInboxListItem(databaseRow), {
      id: 12,
      stationId: 'station-1',
      topic: 'fiscal',
      status: 'FAILED',
      requestId: 'request-12',
      attemptCount: 3,
      nextAttemptAt: '2026-07-22T10:00:00Z',
      receivedAt: '2026-07-21T10:00:00Z',
      processedAt: null,
      deadAt: null,
      resolvedAt: '2026-07-21T11:00:00Z',
      errorText: 'network',
      relatedTransactionId: 'transaction-12',
      relatedTransactionStatus: 'FISCALIZATION_FAILED',
      message: { transactionId: 'transaction-from-message' },
    })
  })

  it('normalizes mixed snake-case and camel-case runtime rows', () => {
    const rows = normalizeFiscalInboxRows([
      databaseRow,
      {
        id: 13,
        stationId: 'station-2',
        topic: 'pos',
        status: 'PENDING',
        requestId: 'request-13',
        attemptCount: 0,
        receivedAt: '2026-07-21T12:00:00Z',
      },
    ])

    assert.equal(rows[0]?.createdAt, '2026-07-21T10:00:00Z')
    assert.equal(rows[1]?.stationId, 'station-2')
    assert.equal(rows[1]?.requestId, 'request-13')
    assert.equal(rows[1]?.attemptCount, 0)

    assert.equal(normalizeFiscalInboxItem(null), null)
    assert.equal(normalizeFiscalInboxItem(databaseRow)?.id, 12)
    assert.equal(
      normalizeFiscalInboxItem({
        ...databaseRow,
        station_id: undefined,
        stationId: 'camel-station',
        message_json: undefined,
        message: { value: 1 },
      })?.stationId,
      'camel-station',
    )
  })

  it('presents list/detail values and resolves transaction identifiers', () => {
    const item = mapFiscalInboxListItem(databaseRow)
    assert.deepEqual(presentFiscalInboxListRows([item]), [
      {
        id: 12,
        stationId: 'station-1',
        topic: 'fiscal',
        status: 'FAILED',
        requestId: 'request-12',
        attemptCount: 3,
        nextAttemptAt: '2026-07-22T10:00:00Z',
        createdAt: '2026-07-21T10:00:00Z',
        processedAt: null,
        deadAt: null,
        resolvedAt: '2026-07-21T11:00:00Z',
        errorText: 'network',
        relatedTransactionId: 'transaction-12',
        relatedTransactionStatus: 'FISCALIZATION_FAILED',
      },
    ])
    assert.deepEqual(presentFiscalInboxListRows({ total: 1, limit: 20, offset: 0, items: [item] }), presentFiscalInboxListRows([item]))
    assert.deepEqual(presentFiscalInboxItem(databaseRow as any), normalizeFiscalInboxItem(databaseRow))
    assert.equal(presentFiscalInboxDetail(databaseRow as any), databaseRow)
    assert.equal(presentFiscalInboxDetail(null), null)
    assert.equal(extractTransactionId(databaseRow as any), 'transaction-from-message')
    assert.equal(getFiscalInboxTransactionId(databaseRow as any), 'transaction-from-message')
    assert.equal(
      extractTransactionId({ message_json: 'not-an-object', request_id: 'fallback' } as any),
      'fallback',
    )
  })
})
