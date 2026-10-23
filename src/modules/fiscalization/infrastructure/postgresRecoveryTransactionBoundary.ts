import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { persistFiscalizationEventRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'
import type { RecoveryTransactionBoundary, RecoveryTransactionClient } from './transactionalRecoveryAdapter'
import { persistAndLinkRecoveryAudit } from './recoveryAuditLink'

/**
 * Opt-in PostgreSQL adapter. Nothing in production imports or constructs it.
 * All operations run inside one withTransaction callback; a thrown audit error
 * rolls back both the guarded status change and the event/summary writes.
 *
 * This is not a substitute for the existing completion path: receipt creation
 * and auto-print parity are still outstanding integration prerequisites.
 */
export function createPostgresRecoveryTransactionBoundary(): RecoveryTransactionBoundary {
  return {
    transaction<T>(run: (client: RecoveryTransactionClient) => Promise<T>): Promise<T> {
      return withTransaction(async (client: PoolClient) => run({
        async query(sql, params) {
          const response = await txQuery<{ id: string; station_id: string; fiscal_document_id: string; status: string }>(client, sql, [...params])
          return { rows: response.rows }
        },
        async recordRecoveryAudit(input) {
          await persistAndLinkRecoveryAudit({
            async persist(audit) {
              const recorded = await persistFiscalizationEventRepo({
                stationId: audit.stationId,
                transactionId: audit.transactionId,
                fiscalDocumentId: audit.documentId,
                engine: 'vpos-proxy-status-recovery',
                transport: 'proxy',
                status: 'SUCCESS',
                idempotencyKey: audit.idempotencyKey,
                responsePayload: {
                  documentId: audit.documentId,
                  status: audit.observedStatus,
                  recoveredFromStatusLookup: true,
                },
                client,
              })
              return {
                eventId: recorded.event.id,
                summary: recorded.compatibilitySummary,
              }
            },
            async link(audit) {
              const response = await txQuery<{ id: string }>(
                client,
                `UPDATE transactions
                    SET latest_fiscal_event_id = $3::uuid,
                        fiscalization_response = $4,
                        updated_at = NOW()
                  WHERE station_id = $1::uuid
                    AND id = $2::uuid
                    AND status = 'FISCALIZED'
                    AND fiscal_document_id = $5
                    AND deleted_at IS NULL
                RETURNING id`,
                [
                  audit.stationId,
                  audit.transactionId,
                  audit.eventId,
                  JSON.stringify(audit.summary),
                  audit.documentId,
                ],
              )
              return response.rows.length
            },
          }, input)
        },
      }))
    },
  }
}
