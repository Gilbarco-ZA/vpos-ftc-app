import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery } from '@/src/platform/db/postgres'

export interface RecoveryFiscalEventSource {
  id: string
  documentId: string | null
  reference: string | null
  status: string
  engine: string | null
  responsePayload: unknown
}

/**
 * Reads fiscal evidence from the event actually linked by the recovered
 * transaction. A different successful event for the same transaction must
 * not be used as a substitute.
 */
export function createPostgresRecoveryFiscalEventSource(client: PoolClient) {
  return {
    async read(input: { stationId: string; transactionId: string; eventId: string }): Promise<RecoveryFiscalEventSource | null> {
      if (!input.stationId.trim() || !input.transactionId.trim() || !input.eventId.trim()) {
        throw new Error('Linked fiscal event source identifiers required')
      }
      const result = await txQuery<{
        id: string
        fiscal_document_id: string | null
        reference: string | null
        status: string
        engine: string | null
        response_payload: unknown
      }>(client, `
        SELECT e.id::text AS id, e.fiscal_document_id, e.reference, e.status,
               e.engine, e.response_payload
          FROM fiscalization_events e
          JOIN transactions t
            ON t.id = e.transaction_id AND t.station_id = e.station_id
           AND t.latest_fiscal_event_id = e.id
         WHERE e.station_id = $1::uuid AND e.transaction_id = $2::uuid
           AND e.id = $3::uuid AND t.deleted_at IS NULL
           AND t.status = 'FISCALIZED'
         FOR UPDATE OF t`, [input.stationId, input.transactionId, input.eventId])
      if (result.rows.length > 1) throw new Error('Ambiguous linked fiscal event')
      const row = result.rows[0]
      return row ? {
        id: row.id,
        documentId: row.fiscal_document_id,
        reference: row.reference,
        status: row.status,
        engine: row.engine,
        responsePayload: row.response_payload,
      } : null
    },
  }
}

/**
 * Existing recovery audit events contain only document/status evidence.
 * They cannot authenticate a complete receipt, even if a candidate supplied
 * by a caller happens to match the transaction reference.
 */
export function assessRecoveryEventSource(
  source: RecoveryFiscalEventSource | null,
  expected: { eventId: string; documentId: string; reference: string },
): { usable: boolean; reason: string } {
  if (!source || source.id !== expected.eventId || source.documentId !== expected.documentId ||
      source.status !== 'SUCCESS' || !expected.reference.trim() || source.reference !== expected.reference) {
    return { usable: false, reason: 'Linked SUCCESS fiscal event lacks correlated identity and reference' }
  }
  if (source.engine === 'vpos-proxy-status-recovery') {
    return { usable: false, reason: 'Status-only recovery audit is not authoritative receipt evidence' }
  }
  if (!source.responsePayload || typeof source.responsePayload !== 'object' ||
      Array.isArray(source.responsePayload)) {
    return { usable: false, reason: 'Linked fiscal event has no structured provider response' }
  }
  return { usable: true, reason: 'Linked event is eligible for country-specific receipt interpretation' }
}
