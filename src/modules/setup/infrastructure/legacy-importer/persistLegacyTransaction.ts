import { withTransaction } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  buildLegacyFiscalizationIdempotencyKey,
  classifyLegacyFiscalizationResponse,
  deriveLegacyFiscalizationEngine,
  deriveLegacyFiscalizationEventStatus,
  deriveLegacyFiscalizationReference,
} from '@/src/modules/transactions/domain/fiscalization-backfill'
import { persistFiscalizationEventRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'

export type LegacyImportedTransactionInput = {
  id?: string
  stationId: string
  pumpNumber: number
  transactionDateTime: string | Date
  totalAmount: number
  volume: number | null
  fuelType: string | null
  posReference: string | null
  status: string
  fiscalizationReference: string | null
  fiscalDocumentId?: string | null
  responsePayload: unknown
  legacyFilename: string
}

export async function persistLegacyImportedTransaction(
  input: LegacyImportedTransactionInput,
): Promise<string> {
  const transactionId = input.id || uuidv4()
  const classification = classifyLegacyFiscalizationResponse(
    input.responsePayload,
  )
  const responsePayload =
    classification.kind === 'legacy_payload' ? classification.payload : null
  const payloadHash =
    classification.kind === 'legacy_payload'
      ? classification.payloadHash
      : 'no-payload'

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO transactions (
         id, station_id, customer_id, pump_number, transaction_date_time,
         total_amount, volume, fuel_type, pos_reference, status,
         fiscalization_reference, fiscal_document_id, fiscalization_response,
         legacy_filename, created_at, updated_at
       )
       VALUES (
         $1::uuid, $2::uuid, NULL, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, NULL, $12, NOW(), NOW()
       )`,
      [
        transactionId,
        input.stationId,
        input.pumpNumber,
        input.transactionDateTime,
        input.totalAmount,
        input.volume,
        input.fuelType,
        input.posReference,
        input.status,
        input.fiscalizationReference,
        input.fiscalDocumentId ?? null,
        input.legacyFilename,
      ],
    )

    const recorded = await persistFiscalizationEventRepo({
      stationId: input.stationId,
      transactionId,
      engine: deriveLegacyFiscalizationEngine(responsePayload),
      transport: 'legacy',
      status: deriveLegacyFiscalizationEventStatus({
        transactionStatus: input.status,
        fiscalizedAt:
          input.status.toUpperCase() === 'FISCALIZED'
            ? input.transactionDateTime
            : null,
        payload: responsePayload,
      }),
      reference: deriveLegacyFiscalizationReference({
        transactionReference: input.fiscalizationReference,
        payload: responsePayload,
      }),
      fiscalDocumentId: input.fiscalDocumentId,
      responsePayload,
      idempotencyKey: buildLegacyFiscalizationIdempotencyKey({
        transactionId,
        payloadHash,
      }),
      origin: 'legacy_import',
      occurredAt: input.transactionDateTime,
      client,
    })

    await client.query(
      `UPDATE transactions
          SET latest_fiscal_event_id = $3::uuid,
              fiscalization_response = $4,
              fiscalized_at = CASE
                WHEN $5 = 'SUCCESS' THEN COALESCE(fiscalized_at, $6::timestamptz)
                ELSE fiscalized_at
              END,
              updated_at = NOW()
        WHERE station_id = $1::uuid
          AND id = $2::uuid`,
      [
        input.stationId,
        transactionId,
        recorded.event.id,
        JSON.stringify(recorded.compatibilitySummary),
        recorded.event.status,
        input.transactionDateTime,
      ],
    )
  })

  return transactionId
}
