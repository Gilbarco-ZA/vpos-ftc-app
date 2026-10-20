import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery } from '@/src/platform/db/postgres'
import type { RecoveryReceiptReadPort, RecoveryReceiptRow } from './recoveryReceiptVerification'

/** Requires an existing transaction-scoped client; never opens a connection. */
export function createPostgresRecoveryReceiptRead(client: PoolClient): RecoveryReceiptReadPort {
  return {
    async find({ stationId, transactionId }) {
      const result = await txQuery<RecoveryReceiptRow>(client, `
        SELECT r.id, r.receipt_number, r.fiscal_data,
               t.fiscal_document_id AS transaction_document_id,
               t.latest_fiscal_event_id::text AS latest_fiscal_event_id,
               t.fiscalization_reference,
               e.id::text AS event_id, e.status AS event_status,
               e.reference AS event_reference
          FROM receipts r
          JOIN transactions t ON t.id = r.transaction_id
                             AND t.station_id = r.station_id
          LEFT JOIN fiscalization_events e
                 ON e.id = t.latest_fiscal_event_id
                AND e.station_id = t.station_id
                AND e.transaction_id = t.id
         WHERE r.station_id = $1::uuid
           AND r.transaction_id = $2::uuid
           AND r.voided_at IS NULL
           AND t.deleted_at IS NULL
         ORDER BY r.generated_at DESC, r.id DESC
         LIMIT 2
         FOR UPDATE OF r`, [stationId, transactionId])
      if (result.rows.length > 1) {
        throw new Error('Ambiguous persisted receipts for recovered transaction')
      }
      return result.rows[0] ?? null
    },
  }
}
