import type {
  FiscalizationCompatibilitySummaryV1,
  FiscalizationEventOrigin,
  FiscalizationEventStatus,
  FiscalizationTransport,
} from '@/src/modules/transactions/domain/fiscalization-event'
import type { PoolClient, QueryResultRow } from '@/src/platform/db/postgres'

import { queryOne, txQuery } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  buildFiscalizationCompatibilitySummary,
  FISCAL_EVENT_SCHEMA_VERSION,
  hashFiscalPayload,
  normalizeFiscalPayload,
  sanitizeFiscalText,
} from '@/src/modules/transactions/domain/fiscalization-event'

export type PersistFiscalizationEventInput = {
  stationId: string
  transactionId: string
  engine: string
  transport: FiscalizationTransport
  status: FiscalizationEventStatus
  reference?: string | null
  fiscalDocumentId?: string | null
  requestPayload?: unknown
  responsePayload?: unknown
  errorMessage?: string | null
  idempotencyKey?: string | null
  existingEventId?: string | null
  origin?: FiscalizationEventOrigin
  occurredAt?: string | Date | null
  client?: PoolClient | null
}

export type FiscalizationEventWriteDetails = Pick<
  PersistFiscalizationEventInput,
  | 'engine'
  | 'transport'
  | 'reference'
  | 'fiscalDocumentId'
  | 'requestPayload'
  | 'responsePayload'
  | 'errorMessage'
  | 'idempotencyKey'
  | 'existingEventId'
  | 'origin'
  | 'occurredAt'
>

export type PersistedFiscalizationEvent = {
  id: string
  station_id: string
  transaction_id: string
  engine: string
  transport: FiscalizationTransport
  status: FiscalizationEventStatus
  reference: string | null
  request_payload: unknown
  response_payload: unknown
  error_message: string | null
  schema_version: number
  payload_hash: string | null
  origin: FiscalizationEventOrigin
  idempotency_key: string | null
  occurred_at: string | Date
  finalized_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

const executeOne = async <T extends QueryResultRow>(
  client: PoolClient | null | undefined,
  sql: string,
  params: unknown[],
): Promise<T | null> => {
  if (client) {
    const result = await txQuery<T>(client, sql, params)
    return result.rows?.[0] ?? null
  }
  return await queryOne<T>(sql, params)
}

export async function persistFiscalizationEventRepo(
  input: PersistFiscalizationEventInput,
): Promise<{
  event: PersistedFiscalizationEvent
  compatibilitySummary: FiscalizationCompatibilitySummaryV1
}> {
  const requestPayload = normalizeFiscalPayload(input.requestPayload)
  const responsePayload = normalizeFiscalPayload(input.responsePayload)
  const payloadHash = hashFiscalPayload({ requestPayload, responsePayload })
  const eventId = input.existingEventId || uuidv4()
  const occurredAt = input.occurredAt ?? new Date()
  const updatedOccurredAt = input.occurredAt ?? null
  const finalized = input.status === 'PENDING' ? null : new Date()

  const event = input.existingEventId
    ? await executeOne<PersistedFiscalizationEvent>(
        input.client,
        `UPDATE fiscalization_events
            SET engine = $4,
                transport = $5,
                status = $6,
                reference = COALESCE($7, reference),
                request_payload = COALESCE($8::jsonb, request_payload),
                response_payload = COALESCE($9::jsonb, response_payload),
                error_message = $10,
                schema_version = $11,
                payload_hash = COALESCE($12, payload_hash),
                origin = $13,
                idempotency_key = COALESCE($14, idempotency_key),
                occurred_at = COALESCE($15::timestamptz, occurred_at),
                finalized_at = $16,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND station_id = $2::uuid
            AND transaction_id = $3::uuid
        RETURNING *`,
        [
          eventId,
          input.stationId,
          input.transactionId,
          input.engine,
          input.transport,
          input.status,
          input.reference ?? null,
          requestPayload == null ? null : JSON.stringify(requestPayload),
          responsePayload == null ? null : JSON.stringify(responsePayload),
          input.errorMessage ? sanitizeFiscalText(input.errorMessage) : null,
          FISCAL_EVENT_SCHEMA_VERSION,
          payloadHash,
          input.origin ?? 'runtime',
          input.idempotencyKey ?? null,
          updatedOccurredAt,
          finalized,
        ],
      )
    : await executeOne<PersistedFiscalizationEvent>(
        input.client,
        `INSERT INTO fiscalization_events (
           id, station_id, transaction_id, engine, transport, status,
           reference, request_payload, response_payload, error_message,
           schema_version, payload_hash, origin, idempotency_key,
           occurred_at, finalized_at
         )
         VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
           $7, $8::jsonb, $9::jsonb, $10,
           $11, $12, $13, $14,
           $15::timestamptz, $16
         )
         ON CONFLICT (station_id, idempotency_key)
         WHERE idempotency_key IS NOT NULL
         DO UPDATE SET
           engine = EXCLUDED.engine,
           transport = EXCLUDED.transport,
           status = EXCLUDED.status,
           reference = COALESCE(EXCLUDED.reference, fiscalization_events.reference),
           request_payload = COALESCE(EXCLUDED.request_payload, fiscalization_events.request_payload),
           response_payload = COALESCE(EXCLUDED.response_payload, fiscalization_events.response_payload),
           error_message = EXCLUDED.error_message,
           schema_version = EXCLUDED.schema_version,
           payload_hash = COALESCE(EXCLUDED.payload_hash, fiscalization_events.payload_hash),
           origin = EXCLUDED.origin,
           occurred_at = LEAST(fiscalization_events.occurred_at, EXCLUDED.occurred_at),
           finalized_at = EXCLUDED.finalized_at,
           updated_at = NOW()
         RETURNING *`,
        [
          eventId,
          input.stationId,
          input.transactionId,
          input.engine,
          input.transport,
          input.status,
          input.reference ?? null,
          requestPayload == null ? null : JSON.stringify(requestPayload),
          responsePayload == null ? null : JSON.stringify(responsePayload),
          input.errorMessage ? sanitizeFiscalText(input.errorMessage) : null,
          FISCAL_EVENT_SCHEMA_VERSION,
          payloadHash,
          input.origin ?? 'runtime',
          input.idempotencyKey ?? null,
          occurredAt,
          finalized,
        ],
      )

  if (!event && input.existingEventId) {
    return await persistFiscalizationEventRepo({
      ...input,
      existingEventId: null,
    })
  }

  if (!event) {
    throw new Error(
      `Unable to persist fiscalization event for transaction ${input.transactionId}`,
    )
  }

  return {
    event,
    compatibilitySummary: buildFiscalizationCompatibilitySummary({
      eventId: event.id,
      status: event.status,
      engine: event.engine,
      transport: event.transport,
      reference: event.reference,
      fiscalDocumentId: input.fiscalDocumentId ?? null,
      responsePayload: event.response_payload,
      payloadHash: event.payload_hash,
      occurredAt: event.occurred_at,
    }),
  }
}

export async function getLatestFiscalizationEventRepo(input: {
  stationId: string
  transactionId: string
  status?: FiscalizationEventStatus | null
}) {
  return await queryOne<PersistedFiscalizationEvent>(
    `SELECT *
       FROM fiscalization_events
      WHERE station_id = $1::uuid
        AND transaction_id = $2::uuid
        AND ($3::text IS NULL OR status = $3)
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 1`,
    [input.stationId, input.transactionId, input.status ?? null],
  )
}
