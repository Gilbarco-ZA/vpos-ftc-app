import type {
  FiscalizationBackfillCandidate,
  FiscalizationBackfillCursor,
} from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-backfill.repository'
import type { PersistedFiscalizationEvent } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'
import type { PoolClient } from '@/src/platform/db/postgres'

import { queryAll, withTransaction } from '@/src/platform/db/postgres'

import {
  buildLegacyFiscalizationIdempotencyKey,
  classifyLegacyFiscalizationResponse,
  deriveLegacyFiscalizationEngine,
  deriveLegacyFiscalizationEventStatus,
  deriveLegacyFiscalizationReference,
} from '@/src/modules/transactions/domain/fiscalization-backfill'
import { buildFiscalizationCompatibilitySummary } from '@/src/modules/transactions/domain/fiscalization-event'
import {
  compactTransactionFiscalizationResponseRepo,
  countFiscalizedTransactionsWithoutCanonicalEventRepo,
  countRepairableLatestFiscalEventPointersRepo,
  findEquivalentFiscalizationEventRepo,
  getFiscalizationEventByIdRepo,
  listFiscalizationBackfillCandidatesRepo,
  repairLatestFiscalEventPointersBatchRepo,
  tryFiscalizationBackfillLock,
} from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-backfill.repository'
import { persistFiscalizationEventRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'

export type FiscalizationBackfillMetrics = {
  stationId: string
  dryRun: boolean
  batches: number
  scanned: number
  legacyPayloadRows: number
  compatibilitySummaryRows: number
  emptyRows: number
  existingCanonicalRows: number
  equivalentEventRows: number
  createdEvents: number
  wouldCreateEvents: number
  compactedTransactions: number
  wouldCompactTransactions: number
  brokenSummaryPointers: number
  repairedSummaryPointers: number
  wouldRepairSummaryPointers: number
  lockUnavailable: boolean
  stoppedAtBatchLimit: boolean
  repairedLatestPointers: number
  wouldRepairLatestPointers: number
  pointerRepairStoppedAtBatchLimit: boolean
}

export type FiscalizationSyncReadiness = {
  stationId: string
  legacyPayloadRows: number
  compatibilitySummaryRows: number
  canonicalEventRows: number
  legacyPayloadWithoutEvent: number
  legacyPayloadWithEventDuplicate: number
  brokenSummaryPointers: number
  fiscalizedTransactionsWithoutCanonicalEvent: number
  cutoverReady: boolean
}

const clampBatchSize = (value: number | undefined): number =>
  Math.min(2_000, Math.max(1, Math.trunc(value ?? 250)))

const clampMaxBatches = (value: number | undefined): number =>
  Math.min(10_000, Math.max(1, Math.trunc(value ?? 100)))

const eventFromCandidate = (
  row: FiscalizationBackfillCandidate,
): PersistedFiscalizationEvent | null => {
  if (!row.latest_event_id || !row.latest_event_status) return null
  return {
    id: row.latest_event_id,
    station_id: row.station_id,
    transaction_id: row.id,
    engine: row.latest_event_engine || 'legacy',
    transport: row.latest_event_transport || 'legacy',
    status: row.latest_event_status,
    reference: row.latest_event_reference,
    request_payload: null,
    response_payload: row.latest_event_response_payload,
    error_message: null,
    schema_version: 1,
    payload_hash: row.latest_event_payload_hash,
    origin: 'backfill',
    idempotency_key: null,
    occurred_at: row.latest_event_occurred_at || row.created_at,
    finalized_at: null,
    created_at: row.created_at,
    updated_at: row.created_at,
  }
}

const buildSummaryForEvent = (input: {
  row: FiscalizationBackfillCandidate
  event: PersistedFiscalizationEvent
}) =>
  buildFiscalizationCompatibilitySummary({
    eventId: input.event.id,
    status: input.event.status,
    engine: input.event.engine,
    transport: input.event.transport,
    reference: input.event.reference || input.row.fiscalization_reference,
    fiscalDocumentId: input.row.fiscal_document_id,
    responsePayload: input.event.response_payload,
    payloadHash: input.event.payload_hash,
    occurredAt: input.event.occurred_at,
  })

async function processCandidate(input: {
  client: PoolClient
  row: FiscalizationBackfillCandidate
  dryRun: boolean
  metrics: FiscalizationBackfillMetrics
}): Promise<void> {
  const classification = classifyLegacyFiscalizationResponse(
    input.row.fiscalization_response,
  )

  if (classification.kind === 'empty') {
    input.metrics.emptyRows += 1
    return
  }

  if (classification.kind === 'compatibility_summary') {
    input.metrics.compatibilitySummaryRows += 1
    let event = eventFromCandidate(input.row)
    if (!event) {
      event = await getFiscalizationEventByIdRepo({
        client: input.client,
        stationId: input.row.station_id,
        transactionId: input.row.id,
        eventId: classification.summary.eventId,
      })
    }
    if (!event) {
      input.metrics.brokenSummaryPointers += 1
      return
    }

    if (
      classification.summary.eventId === event.id &&
      input.row.latest_event_id === event.id
    ) {
      return
    }
    if (input.dryRun) {
      input.metrics.wouldRepairSummaryPointers += 1
      return
    }

    const repaired = await compactTransactionFiscalizationResponseRepo({
      client: input.client,
      stationId: input.row.station_id,
      transactionId: input.row.id,
      eventId: event.id,
      compatibilitySummary: buildSummaryForEvent({ row: input.row, event }),
    })
    if (repaired) input.metrics.repairedSummaryPointers += 1
    return
  }

  input.metrics.legacyPayloadRows += 1

  let event =
    input.row.latest_event_response_payload != null
      ? eventFromCandidate(input.row)
      : null

  if (event) {
    input.metrics.existingCanonicalRows += 1
  } else {
    event = await findEquivalentFiscalizationEventRepo({
      client: input.client,
      stationId: input.row.station_id,
      transactionId: input.row.id,
      payloadHash: classification.payloadHash,
      responsePayload: classification.payload,
    })
    if (event) input.metrics.equivalentEventRows += 1
  }

  if (!event) {
    if (input.dryRun) {
      input.metrics.wouldCreateEvents += 1
      input.metrics.wouldCompactTransactions += 1
      return
    }

    const status = deriveLegacyFiscalizationEventStatus({
      transactionStatus: input.row.status,
      fiscalizedAt: input.row.fiscalized_at,
      payload: classification.payload,
    })
    const recorded = await persistFiscalizationEventRepo({
      stationId: input.row.station_id,
      transactionId: input.row.id,
      engine: deriveLegacyFiscalizationEngine(classification.payload),
      transport: 'legacy',
      status,
      reference: deriveLegacyFiscalizationReference({
        transactionReference: input.row.fiscalization_reference,
        payload: classification.payload,
      }),
      fiscalDocumentId: input.row.fiscal_document_id,
      responsePayload: classification.payload,
      idempotencyKey: buildLegacyFiscalizationIdempotencyKey({
        transactionId: input.row.id,
        payloadHash: classification.payloadHash,
      }),
      origin: 'backfill',
      occurredAt:
        input.row.fiscalized_at ||
        input.row.transaction_date_time ||
        input.row.created_at,
      client: input.client,
    })
    event = recorded.event
    input.metrics.createdEvents += 1
  }

  if (input.dryRun) {
    input.metrics.wouldCompactTransactions += 1
    return
  }

  const compacted = await compactTransactionFiscalizationResponseRepo({
    client: input.client,
    stationId: input.row.station_id,
    transactionId: input.row.id,
    eventId: event.id,
    compatibilitySummary: buildSummaryForEvent({ row: input.row, event }),
  })
  if (compacted) input.metrics.compactedTransactions += 1
}

export async function backfillLegacyFiscalizationEvents(input: {
  stationId: string
  dryRun?: boolean
  batchSize?: number
  maxBatches?: number
}): Promise<FiscalizationBackfillMetrics> {
  const dryRun = input.dryRun !== false
  const batchSize = clampBatchSize(input.batchSize)
  const maxBatches = clampMaxBatches(input.maxBatches)
  const metrics: FiscalizationBackfillMetrics = {
    stationId: input.stationId,
    dryRun,
    batches: 0,
    scanned: 0,
    legacyPayloadRows: 0,
    compatibilitySummaryRows: 0,
    emptyRows: 0,
    existingCanonicalRows: 0,
    equivalentEventRows: 0,
    createdEvents: 0,
    wouldCreateEvents: 0,
    compactedTransactions: 0,
    wouldCompactTransactions: 0,
    brokenSummaryPointers: 0,
    repairedSummaryPointers: 0,
    wouldRepairSummaryPointers: 0,
    lockUnavailable: false,
    stoppedAtBatchLimit: false,
    repairedLatestPointers: 0,
    wouldRepairLatestPointers: 0,
    pointerRepairStoppedAtBatchLimit: false,
  }

  if (dryRun) {
    metrics.wouldRepairLatestPointers = await withTransaction(async (client) =>
      countRepairableLatestFiscalEventPointersRepo({
        client,
        stationId: input.stationId,
      }),
    )
  } else {
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const repaired = await withTransaction(async (client) => {
        const locked = await tryFiscalizationBackfillLock(
          client,
          input.stationId,
        )
        if (!locked) return null
        return await repairLatestFiscalEventPointersBatchRepo({
          client,
          stationId: input.stationId,
          batchSize,
        })
      })
      if (repaired == null) {
        metrics.lockUnavailable = true
        return metrics
      }
      metrics.repairedLatestPointers += repaired
      if (repaired < batchSize) break
      if (batch === maxBatches - 1) {
        metrics.pointerRepairStoppedAtBatchLimit = true
      }
    }
  }

  let cursor: FiscalizationBackfillCursor | null = null

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await withTransaction(async (client) => {
      if (!dryRun) {
        const locked = await tryFiscalizationBackfillLock(
          client,
          input.stationId,
        )
        if (!locked)
          return { rows: [] as FiscalizationBackfillCandidate[], locked: false }
      }

      const rows = await listFiscalizationBackfillCandidatesRepo({
        client,
        stationId: input.stationId,
        batchSize,
        cursor,
        lockRows: !dryRun,
      })

      for (const row of rows) {
        await processCandidate({ client, row, dryRun, metrics })
      }

      return { rows, locked: true }
    })

    if (!result.locked) {
      metrics.lockUnavailable = true
      break
    }
    if (!result.rows.length) break

    metrics.batches += 1
    metrics.scanned += result.rows.length
    const last = result.rows[result.rows.length - 1]
    cursor = {
      createdAt: new Date(last.created_at).toISOString(),
      transactionId: last.id,
    }

    if (result.rows.length < batchSize) break
    if (batch === maxBatches - 1) metrics.stoppedAtBatchLimit = true
  }

  return metrics
}

export async function assessFiscalizationSyncReadiness(input: {
  stationId: string
  batchSize?: number
}): Promise<FiscalizationSyncReadiness> {
  const batchSize = clampBatchSize(input.batchSize)
  const readiness: FiscalizationSyncReadiness = {
    stationId: input.stationId,
    legacyPayloadRows: 0,
    compatibilitySummaryRows: 0,
    canonicalEventRows: 0,
    legacyPayloadWithoutEvent: 0,
    legacyPayloadWithEventDuplicate: 0,
    brokenSummaryPointers: 0,
    fiscalizedTransactionsWithoutCanonicalEvent: 0,
    cutoverReady: false,
  }

  let cursor: FiscalizationBackfillCursor | null = null
  while (true) {
    const rows = await withTransaction(async (client) =>
      listFiscalizationBackfillCandidatesRepo({
        client,
        stationId: input.stationId,
        batchSize,
        cursor,
        lockRows: false,
      }),
    )
    if (!rows.length) break

    for (const row of rows) {
      const classification = classifyLegacyFiscalizationResponse(
        row.fiscalization_response,
      )
      if (classification.kind === 'compatibility_summary') {
        readiness.compatibilitySummaryRows += 1
        if (
          !row.latest_event_id ||
          classification.summary.eventId !== row.latest_event_id
        ) {
          readiness.brokenSummaryPointers += 1
        } else {
          readiness.canonicalEventRows += 1
        }
        continue
      }
      if (classification.kind !== 'legacy_payload') continue

      readiness.legacyPayloadRows += 1
      if (row.latest_event_response_payload != null) {
        readiness.legacyPayloadWithEventDuplicate += 1
        readiness.canonicalEventRows += 1
      } else {
        readiness.legacyPayloadWithoutEvent += 1
      }
    }

    const last = rows[rows.length - 1]
    cursor = {
      createdAt: new Date(last.created_at).toISOString(),
      transactionId: last.id,
    }
    if (rows.length < batchSize) break
  }

  readiness.fiscalizedTransactionsWithoutCanonicalEvent = await withTransaction(
    async (client) =>
      countFiscalizedTransactionsWithoutCanonicalEventRepo({
        client,
        stationId: input.stationId,
      }),
  )
  readiness.cutoverReady =
    readiness.legacyPayloadRows === 0 &&
    readiness.brokenSummaryPointers === 0 &&
    readiness.fiscalizedTransactionsWithoutCanonicalEvent === 0
  return readiness
}

export async function listFiscalizationBackfillStationIds(): Promise<string[]> {
  const rows = await queryAll<{ station_id: string }>(
    `SELECT DISTINCT station_id
       FROM transactions
      WHERE fiscalization_response IS NOT NULL
        AND NULLIF(BTRIM(fiscalization_response), '') IS NOT NULL
      ORDER BY station_id`,
  )
  return rows.map((row) => row.station_id)
}
