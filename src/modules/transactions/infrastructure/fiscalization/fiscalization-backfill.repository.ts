import type { PersistedFiscalizationEvent } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'
import type { PoolClient } from '@/src/platform/db/postgres'

import { txQuery } from '@/src/platform/db/postgres'

export type FiscalizationBackfillCursor = {
  createdAt: string
  transactionId: string
}

export type FiscalizationBackfillCandidate = {
  id: string
  station_id: string
  status: string | null
  fiscalization_reference: string | null
  fiscal_document_id: string | null
  fiscalization_response: unknown
  fiscalized_at: string | Date | null
  transaction_date_time: string | Date | null
  created_at: string | Date
  latest_fiscal_event_id: string | null
  latest_event_id: string | null
  latest_event_engine: string | null
  latest_event_transport: 'internal' | 'proxy' | 'legacy' | null
  latest_event_status: 'PENDING' | 'SUCCESS' | 'FAILED' | null
  latest_event_reference: string | null
  latest_event_response_payload: unknown
  latest_event_payload_hash: string | null
  latest_event_occurred_at: string | Date | null
}

export async function tryFiscalizationBackfillLock(
  client: PoolClient,
  stationId: string,
): Promise<boolean> {
  const result = await txQuery<{ locked: boolean }>(
    client,
    `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,
    [`fiscalization_event_backfill:${stationId}`],
  )
  return result.rows[0]?.locked === true
}

export async function listFiscalizationBackfillCandidatesRepo(input: {
  client: PoolClient
  stationId: string
  batchSize: number
  cursor?: FiscalizationBackfillCursor | null
  lockRows: boolean
}): Promise<FiscalizationBackfillCandidate[]> {
  const lockClause = input.lockRows ? 'FOR UPDATE OF t SKIP LOCKED' : ''
  const result = await txQuery<FiscalizationBackfillCandidate>(
    input.client,
    `SELECT t.id,
            t.station_id,
            t.status,
            t.fiscalization_reference,
            t.fiscal_document_id,
            t.fiscalization_response,
            t.fiscalized_at,
            t.transaction_date_time,
            t.created_at,
            t.latest_fiscal_event_id,
            latest.id AS latest_event_id,
            latest.engine AS latest_event_engine,
            latest.transport AS latest_event_transport,
            latest.status AS latest_event_status,
            latest.reference AS latest_event_reference,
            latest.response_payload AS latest_event_response_payload,
            latest.payload_hash AS latest_event_payload_hash,
            latest.occurred_at AS latest_event_occurred_at
       FROM transactions t
       LEFT JOIN fiscalization_events latest
         ON latest.station_id = t.station_id
        AND latest.transaction_id = t.id
        AND latest.id = t.latest_fiscal_event_id
      WHERE t.station_id = $1::uuid
        AND t.fiscalization_response IS NOT NULL
        AND NULLIF(BTRIM(t.fiscalization_response), '') IS NOT NULL
        AND NOT (
          latest.id IS NOT NULL
          AND t.fiscalization_response ~ '^\\s*\\{\\s*"schemaVersion"\\s*:\\s*1\\s*,\\s*"source"\\s*:\\s*"fiscalization_event"'
          AND substring(
            t.fiscalization_response
            FROM '"eventId"\\s*:\\s*"([0-9a-fA-F-]{36})"'
          ) = latest.id::text
        )
        AND (
          $2::timestamptz IS NULL
          OR (t.created_at, t.id) > ($2::timestamptz, $3::uuid)
        )
      ORDER BY t.created_at ASC, t.id ASC
      LIMIT $4
      ${lockClause}`,
    [
      input.stationId,
      input.cursor?.createdAt ?? null,
      input.cursor?.transactionId ?? null,
      input.batchSize,
    ],
  )
  return result.rows
}

export async function getFiscalizationEventByIdRepo(input: {
  client: PoolClient
  stationId: string
  transactionId: string
  eventId: string
}): Promise<PersistedFiscalizationEvent | null> {
  const result = await txQuery<PersistedFiscalizationEvent>(
    input.client,
    `SELECT *
       FROM fiscalization_events
      WHERE id = $3::uuid
        AND station_id = $1::uuid
        AND transaction_id = $2::uuid
      LIMIT 1`,
    [input.stationId, input.transactionId, input.eventId],
  )
  return result.rows[0] ?? null
}

export async function findEquivalentFiscalizationEventRepo(input: {
  client: PoolClient
  stationId: string
  transactionId: string
  payloadHash: string
  responsePayload: unknown
}): Promise<PersistedFiscalizationEvent | null> {
  const result = await txQuery<PersistedFiscalizationEvent>(
    input.client,
    `SELECT *
       FROM fiscalization_events
      WHERE station_id = $1::uuid
        AND transaction_id = $2::uuid
        AND (
          payload_hash = $3
          OR response_payload = $4::jsonb
        )
      ORDER BY
        CASE status WHEN 'SUCCESS' THEN 0 WHEN 'FAILED' THEN 1 ELSE 2 END,
        occurred_at DESC,
        created_at DESC
      LIMIT 1`,
    [
      input.stationId,
      input.transactionId,
      input.payloadHash,
      JSON.stringify(input.responsePayload),
    ],
  )
  return result.rows[0] ?? null
}

export async function compactTransactionFiscalizationResponseRepo(input: {
  client: PoolClient
  stationId: string
  transactionId: string
  eventId: string
  compatibilitySummary: unknown
}): Promise<boolean> {
  const result = await txQuery(
    input.client,
    `UPDATE transactions
        SET latest_fiscal_event_id = $3::uuid,
            fiscalization_response = $4,
            updated_at = NOW()
      WHERE station_id = $1::uuid
        AND id = $2::uuid`,
    [
      input.stationId,
      input.transactionId,
      input.eventId,
      JSON.stringify(input.compatibilitySummary),
    ],
  )
  return (result.rowCount ?? 0) > 0
}

export async function countRepairableLatestFiscalEventPointersRepo(input: {
  client: PoolClient
  stationId: string
}): Promise<number> {
  const result = await txQuery<{ count: string }>(
    input.client,
    `SELECT COUNT(*)::text AS count
       FROM transactions t
       LEFT JOIN fiscalization_events pointed
         ON pointed.station_id = t.station_id
        AND pointed.transaction_id = t.id
        AND pointed.id = t.latest_fiscal_event_id
      WHERE t.station_id = $1::uuid
        AND t.deleted_at IS NULL
        AND (t.latest_fiscal_event_id IS NULL OR pointed.id IS NULL)
        AND EXISTS (
          SELECT 1
            FROM fiscalization_events event
           WHERE event.station_id = t.station_id
             AND event.transaction_id = t.id
        )`,
    [input.stationId],
  )
  return Number(result.rows[0]?.count ?? 0)
}

export async function repairLatestFiscalEventPointersBatchRepo(input: {
  client: PoolClient
  stationId: string
  batchSize: number
}): Promise<number> {
  const result = await txQuery(
    input.client,
    `WITH candidates AS (
       SELECT t.id AS transaction_id, latest.id AS event_id
         FROM transactions t
         LEFT JOIN fiscalization_events pointed
           ON pointed.station_id = t.station_id
          AND pointed.transaction_id = t.id
          AND pointed.id = t.latest_fiscal_event_id
         JOIN LATERAL (
           SELECT event.id
             FROM fiscalization_events event
            WHERE event.station_id = t.station_id
              AND event.transaction_id = t.id
            ORDER BY event.occurred_at DESC, event.created_at DESC
            LIMIT 1
         ) latest ON TRUE
        WHERE t.station_id = $1::uuid
          AND t.deleted_at IS NULL
          AND (t.latest_fiscal_event_id IS NULL OR pointed.id IS NULL)
        ORDER BY t.created_at ASC, t.id ASC
        LIMIT $2
        FOR UPDATE OF t SKIP LOCKED
     )
     UPDATE transactions t
        SET latest_fiscal_event_id = candidates.event_id,
            updated_at = NOW()
       FROM candidates
      WHERE t.station_id = $1::uuid
        AND t.id = candidates.transaction_id`,
    [input.stationId, input.batchSize],
  )
  return result.rowCount ?? 0
}

export async function countFiscalizedTransactionsWithoutCanonicalEventRepo(input: {
  client: PoolClient
  stationId: string
}): Promise<number> {
  const result = await txQuery<{ count: string }>(
    input.client,
    `SELECT COUNT(*)::text AS count
       FROM transactions t
       LEFT JOIN fiscalization_events pointed
         ON pointed.station_id = t.station_id
        AND pointed.transaction_id = t.id
        AND pointed.id = t.latest_fiscal_event_id
      WHERE t.station_id = $1::uuid
        AND t.deleted_at IS NULL
        AND (
          t.fiscalized_at IS NOT NULL
          OR UPPER(COALESCE(t.status, '')) IN ('FISCALIZED','PRINTED','REPRINTED','CREDITED','COMPLETED')
        )
        AND (
          t.latest_fiscal_event_id IS NULL
          OR pointed.id IS NULL
        )`,
    [input.stationId],
  )
  return Number(result.rows[0]?.count ?? 0)
}
