import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery } from '@/src/platform/db/postgres'
import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { RecoveryReceiptCreationCandidate } from './recoveryReceiptCreationGate'
import { assessRecoveryReceiptCreation } from './recoveryReceiptCreationGate'

export interface PersistedRecoveryFiscalIdentity {
  documentId: string | null
  fiscalEventId: string | null
  transactionReference: string | null
  eventReference: string | null
  eventStatus: string | null
  status: string
}

/**
 * All database reads happen through the caller's already-open transaction.
 * This is not a receipt generator: the candidate must come from a separately
 * authenticated, complete fiscal receipt source.
 */
export function createPostgresRecoveryReceiptEvidenceReader(client: PoolClient) {
  return {
    async read(input: { stationId: string; transactionId: string }): Promise<PersistedRecoveryFiscalIdentity | null> {
      const result = await txQuery<{
        fiscal_document_id: string | null
        latest_fiscal_event_id: string | null
        fiscalization_reference: string | null
        event_reference: string | null
        event_status: string | null
        status: string
      }>(client, `
        SELECT t.fiscal_document_id,
               t.latest_fiscal_event_id::text AS latest_fiscal_event_id,
               t.fiscalization_reference,
               e.reference AS event_reference,
               e.status AS event_status,
               t.status
          FROM transactions t
          LEFT JOIN fiscalization_events e
            ON e.id = t.latest_fiscal_event_id
           AND e.station_id = t.station_id
           AND e.transaction_id = t.id
         WHERE t.station_id = $1::uuid
           AND t.id = $2::uuid
           AND t.deleted_at IS NULL
         FOR UPDATE OF t`, [input.stationId, input.transactionId])
      if (result.rows.length > 1) throw new Error('Ambiguous recovery transaction identity')
      const row = result.rows[0]
      return row ? {
        documentId: row.fiscal_document_id,
        fiscalEventId: row.latest_fiscal_event_id,
        transactionReference: row.fiscalization_reference,
        eventReference: row.event_reference,
        eventStatus: row.event_status,
        status: row.status,
      } : null
    },
  }
}

export function authorizeRecoveryReceiptCandidate(
  persisted: PersistedRecoveryFiscalIdentity | null,
  candidate: RecoveryReceiptCreationCandidate | null,
  expected: { documentId: string; fiscalEventId: string; countryCode: FiscalCountryCode },
): { allowed: boolean; reason: string } {
  if (!persisted || persisted.status !== 'FISCALIZED' ||
    persisted.documentId !== expected.documentId ||
    persisted.fiscalEventId !== expected.fiscalEventId) {
    return { allowed: false, reason: 'Recovery transaction or linked fiscal event is not current' }
  }
  return assessRecoveryReceiptCreation(candidate, {
    ...expected,
    persistedTransactionReference: persisted.transactionReference,
    persistedEventReference: persisted.eventReference,
    persistedEventStatus: persisted.eventStatus,
  })
}
