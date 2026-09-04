import { txQuery, withTransaction } from '@/src/platform/db/postgres'

const MANUAL_CANCEL_REASON =
  'Fiscalization attempt cancelled manually so the transaction can be retried'

export type CancelStuckFiscalizationResult =
  | { ok: true; transaction: any }
  | {
      ok: false
      reason: 'NOT_FOUND' | 'NOT_FISCALIZING' | 'ALREADY_FISCALIZED'
      status?: string | null
    }

/**
 * Cancel only the active fiscalization attempt, not the sale itself.
 *
 * The transaction is moved from FISCALIZING to FAILED so the existing manual
 * retry flow can move it back to PENDING. Correlation fields belonging to the
 * abandoned proxy attempt are cleared so the proxy worker can claim it again.
 * Fiscalization-event history is retained and pending events are finalized as
 * failures for diagnostics/auditability.
 */
export async function cancelStuckFiscalizationRepo(input: {
  stationId: string
  transactionId: string
}): Promise<CancelStuckFiscalizationResult> {
  return await withTransaction(async (client) => {
    const locked = await txQuery<any>(
      client,
      `SELECT id,
              status,
              fiscalization_reference
         FROM transactions
        WHERE station_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
        FOR UPDATE`,
      [input.stationId, input.transactionId],
    )
    const transaction = locked.rows?.[0]
    if (!transaction) return { ok: false, reason: 'NOT_FOUND' as const }

    const status = String(transaction.status ?? '').trim().toUpperCase()
    if (String(transaction.fiscalization_reference ?? '').trim()) {
      return {
        ok: false,
        reason: 'ALREADY_FISCALIZED' as const,
        status,
      }
    }
    if (status !== 'FISCALIZING') {
      return {
        ok: false,
        reason: 'NOT_FISCALIZING' as const,
        status,
      }
    }

    await txQuery(
      client,
      `UPDATE fiscalization_events
          SET status = 'FAILED',
              error_message = $3,
              finalized_at = NOW(),
              updated_at = NOW()
        WHERE station_id = $1
          AND transaction_id = $2::uuid
          AND status = 'PENDING'`,
      [input.stationId, input.transactionId, MANUAL_CANCEL_REASON],
    )

    await txQuery(
      client,
      `UPDATE transaction_queue
          SET status = 'FAILED',
              last_error = $3,
              next_attempt_at = NULL,
              processing_started_at = NULL,
              updated_at = NOW()
        WHERE station_id = $1
          AND transaction_id = $2::uuid
          AND status IN ('PENDING', 'PROCESSING')`,
      [input.stationId, input.transactionId, MANUAL_CANCEL_REASON],
    )

    const updated = await txQuery<any>(
      client,
      `UPDATE transactions
          SET status = 'FAILED',
              cloud_transaction_id = NULL,
              fiscal_document_id = NULL,
              fiscal_queue_enqueued_at = NULL,
              last_error = $3,
              retry_count = COALESCE(retry_count, 0) + 1,
              updated_at = NOW()
        WHERE station_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
          AND status = 'FISCALIZING'
          AND (fiscalization_reference IS NULL OR BTRIM(fiscalization_reference) = '')
      RETURNING *`,
      [input.stationId, input.transactionId, MANUAL_CANCEL_REASON],
    )

    const row = updated.rows?.[0]
    if (!row) {
      return {
        ok: false,
        reason: 'NOT_FISCALIZING' as const,
        status,
      }
    }

    return { ok: true as const, transaction: row }
  })
}
