import type { PoolClient } from '@/src/platform/db/postgres'
import { txQuery } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'
import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { RecoveryReceiptCreationCandidate } from './recoveryReceiptCreationGate'
import { authorizeRecoveryReceiptCandidate, createPostgresRecoveryReceiptEvidenceReader } from './postgresRecoveryReceiptEvidence'
import { createPostgresRecoveryReceiptRead } from './postgresRecoveryReceiptRead'

/** Complete content must come from an independently verified fiscal receipt source. */
export interface CompleteRecoveryReceiptCandidate extends RecoveryReceiptCreationCandidate {
  plainTextContent: string
  renderVersion: number
}

export async function insertVerifiedRecoveryReceipt(
  client: PoolClient,
  input: {
    stationId: string
    transactionId: string
    documentId: string
    fiscalEventId: string
    countryCode: FiscalCountryCode
  },
  candidate: CompleteRecoveryReceiptCandidate | null,
): Promise<{ kind: 'created'; receiptId: string } | { kind: 'blocked'; reason: string }> {
  if (!input.stationId.trim() || !input.transactionId.trim() ||
      !input.documentId.trim() || !input.fiscalEventId.trim()) {
    throw new Error('Recovery receipt insert identity required')
  }
  // Caller must be inside the unified recovery transaction. This read locks
  // the transaction row before checking for an existing receipt.
  const persisted = await createPostgresRecoveryReceiptEvidenceReader(client).read(input)
  const decision = authorizeRecoveryReceiptCandidate(persisted, candidate, input)
  if (!decision.allowed || !candidate) return { kind: 'blocked', reason: decision.reason }
  if (!candidate.plainTextContent?.trim() ||
      !Number.isSafeInteger(candidate.renderVersion) || candidate.renderVersion < 1) {
    return { kind: 'blocked', reason: 'Authoritative printable receipt content required' }
  }

  const existing = await createPostgresRecoveryReceiptRead(client).find(input)
  if (existing) return { kind: 'blocked', reason: 'Persisted receipt already exists' }

  const id = uuidv4()
  const result = await txQuery<{ id: string }>(client, `
    INSERT INTO receipts (
      id, transaction_id, station_id, receipt_number,
      html_content, plain_text_content, fiscal_data, render_version
    )
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4, NULL, $5, $6::jsonb, $7)
    RETURNING id
  `, [
    id, input.transactionId, input.stationId, candidate.receiptNumber,
    candidate.plainTextContent, JSON.stringify(candidate.fiscalData), candidate.renderVersion,
  ])
  if (result.rows.length !== 1 || result.rows[0]?.id !== id) {
    throw new Error('Recovery receipt insert returned unexpected identity')
  }
  return { kind: 'created', receiptId: id }
}
