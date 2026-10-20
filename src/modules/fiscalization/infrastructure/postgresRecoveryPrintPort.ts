import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery } from '@/src/platform/db/postgres'
import { buildReferencePrintJobPayload } from '@/src/modules/printing/domain/printJobPayload'
import { uuidv4 } from '@/src/shared/utils/uuid'
import type { VerifiedRecoveryPrintPort } from '../application/verifiedRecoveryReceiptCompletion'

/**
 * Opt-in transaction-scoped print adapter. No independent connection or
 * transaction is created; caller must keep this client paired with receipt
 * verification and commit/rollback together.
 */
export function createPostgresRecoveryPrintPort(client: PoolClient): VerifiedRecoveryPrintPort {
  return {
    async isAutoPrintEnabled(stationId) {
      const result = await txQuery<{ auto_print_receipts: boolean | null }>(
        client,
        'SELECT auto_print_receipts FROM station_settings WHERE station_id = $1::uuid',
        [stationId],
      )
      return result.rows[0]?.auto_print_receipts === true
    },
    async ensurePrintJob(input) {
      if (!input.stationId.trim() || !input.transactionId.trim() ||
        !input.receiptId.trim() || !input.receiptNumber.trim() ||
        input.idempotencyKey !== 'receipt:' + input.transactionId.trim() + ':default') {
        throw new Error('Invalid recovery print job identity')
      }
      const payload = buildReferencePrintJobPayload({
        type: 'receipt',
        source: 'vpos.auto-print-receipt',
        receiptId: input.receiptId,
        receiptNumber: input.receiptNumber,
      })
      // Do not overwrite an existing job, which could already have been sent.
      const result = await txQuery<{ idempotency_key: string; source_transaction_id: string; job_type: string; payload: unknown }>(
        client,
        `INSERT INTO print_jobs (
             id, station_id, job_type, payload, priority,
             idempotency_key, source_transaction_id
           )
           VALUES ($1::uuid, $2::uuid, 'print.receipt', $3::jsonb, 10, $4, $5::uuid)
           ON CONFLICT (station_id, idempotency_key) DO NOTHING
           RETURNING idempotency_key, source_transaction_id, job_type, payload`,
        [uuidv4(), input.stationId, JSON.stringify(payload), input.idempotencyKey, input.transactionId],
      )
      if (result.rows.length === 1) {
        return { idempotencyVerified: true }
      }
      const existing = await txQuery<{ idempotency_key: string; source_transaction_id: string; job_type: string; payload: unknown }>(
        client,
        `SELECT idempotency_key, source_transaction_id, job_type, payload
           FROM print_jobs
          WHERE station_id = $1::uuid AND idempotency_key = $2
          LIMIT 1`,
        [input.stationId, input.idempotencyKey],
      )
      const job = existing.rows[0]
      const stored = typeof job?.payload === 'string'
        ? (() => { try { return JSON.parse(job.payload) as unknown } catch { return null } })()
        : job?.payload
      const body = stored && typeof stored === 'object' && !Array.isArray(stored)
        ? stored as Record<string, unknown> : null
      return {
        idempotencyVerified: existing.rows.length === 1 &&
          job?.idempotency_key === input.idempotencyKey &&
          job?.source_transaction_id === input.transactionId &&
          job?.job_type === 'print.receipt' &&
          body?.receiptId === input.receiptId &&
          body?.receiptNumber === input.receiptNumber &&
          body?.storageMode === 'reference',
      }
    },
  }
}
