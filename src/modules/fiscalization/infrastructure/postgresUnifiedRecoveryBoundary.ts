import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { persistFiscalizationEventRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'
import { persistAndLinkRecoveryAudit } from './recoveryAuditLink'
import { insertVerifiedRecoveryReceipt } from './postgresRecoveryReceiptInsert'
import { createPostgresRecoveryReceiptRead } from './postgresRecoveryReceiptRead'
import { createPostgresRecoveryPrintPort } from './postgresRecoveryPrintPort'
import type { UnifiedRecoveryBoundary, UnifiedRecoveryClient } from './unifiedRecoveryCompletion'

/**
 * Opt-in unified PostgreSQL transaction: guarded transition, SUCCESS event,
 * compatibility summary, receipt verification and print-job insertion all use
 * exactly the same PoolClient. This does not enable any production worker.
 */
export function createPostgresUnifiedRecoveryBoundary(): UnifiedRecoveryBoundary {
  return {
    transaction<T>(run: (client: UnifiedRecoveryClient) => Promise<T>): Promise<T> {
      return withTransaction(async (client: PoolClient) => run({
        recovery: {
          async query(sql, params) {
            const result = await txQuery<{
              id: string
              station_id: string
              fiscal_document_id: string
              status: string
            }>(client, sql, [...params])
            return { rows: result.rows }
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
                return { eventId: recorded.event.id, summary: recorded.compatibilitySummary }
              },
              async link(audit) {
                const result = await txQuery<{ id: string }>(client, `
                  UPDATE transactions
                     SET latest_fiscal_event_id = $3::uuid,
                         fiscalization_response = $4::jsonb,
                         updated_at = NOW()
                   WHERE station_id = $1::uuid
                     AND id = $2::uuid
                     AND status = 'FISCALIZED'
                     AND fiscal_document_id = $5
                     AND deleted_at IS NULL
                  RETURNING id`, [
                  audit.stationId, audit.transactionId, audit.eventId,
                  JSON.stringify(audit.summary), audit.documentId,
                ])
                return result.rows.length
              },
            }, input)
          },
        },
        async linkedEventId(input) {
          const result = await txQuery<{ latest_fiscal_event_id: string }>(client, `
            SELECT latest_fiscal_event_id::text AS latest_fiscal_event_id
              FROM transactions
             WHERE station_id = $1::uuid
               AND id = $2::uuid
               AND fiscal_document_id = $3
               AND status = 'FISCALIZED'
               AND deleted_at IS NULL
               AND latest_fiscal_event_id IS NOT NULL
             FOR UPDATE`, [input.stationId, input.transactionId, input.documentId])
          return result.rows.length === 1 ? result.rows[0]?.latest_fiscal_event_id ?? null : null
        },
        receiptRead: createPostgresRecoveryReceiptRead(client),
        insertMissingReceipt: (input, candidate) => insertVerifiedRecoveryReceipt(client, input, candidate),
        printing: createPostgresRecoveryPrintPort(client),
      }))
    },
  }
}
