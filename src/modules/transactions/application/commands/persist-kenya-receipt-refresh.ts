import { queryOne, withTransaction, txQuery } from '@/src/platform/db/postgres'
import { buildFiscalReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptBuilder'
import { buildReceiptFiscalSnapshot } from '@/src/shared/receipts/receiptSnapshots'

/**
 * Persist only a correlated, Approved Kenya status snapshot. Does not reissue
 * an invoice, change transaction fiscalization state or rewrite fiscal events.
 * The latest receipt row becomes the source for subsequent offline reprints.
 */
export async function persistKenyaReceiptRefresh(input: {
  stationId: string
  transactionId: string
  status: unknown
}): Promise<void> {
  const status = input.status && typeof input.status === 'object' && !Array.isArray(input.status)
    ? input.status as Record<string, unknown> : null
  const tx = await queryOne<{
    fiscal_document_id: string | null
    country: string | null
  }>(`SELECT t.fiscal_document_id, fs.country
     FROM transactions t JOIN fuel_stations fs ON fs.id = t.station_id
     WHERE t.station_id = $1::uuid AND t.id = $2::uuid
       AND t.deleted_at IS NULL`, [input.stationId, input.transactionId])
  if (!tx || !['KE', 'KEN', 'KENYA'].includes(String(tx.country ?? '').trim().toUpperCase())) {
    throw new Error('Kenya receipt refresh requires a Kenya transaction')
  }
  if (!tx.fiscal_document_id || status?.documentId !== tx.fiscal_document_id ||
      status?.status !== 'Approved' || status?.error === true) {
    throw new Error('Kenya receipt refresh requires a matching Approved fiscal document')
  }
  const sdcId = String(status.sdcId ?? '').trim()
  const documentNumber = String(status.documentNumber ?? '').trim()
  const code = String(status.fiscalVerificationCode ?? '').trim()
  const qr = String(status.fiscalQrCodeData ?? '').trim()
  if (!sdcId || !documentNumber || !code || !/^https:\/\/[^\s]+$/i.test(qr)) {
    throw new Error('Approved Kenya response lacks required receipt verification metadata')
  }
  const built = await buildFiscalReceipt({
    stationId: input.stationId, transactionId: input.transactionId,
    kenyaApprovedStatus: status,
  })
  const fiscalData = buildReceiptFiscalSnapshot({ model: built.model })
  await withTransaction(async client => {
    const identity = await txQuery(client,
      `SELECT fiscal_document_id FROM transactions
       WHERE station_id = $1::uuid AND id = $2::uuid
         AND deleted_at IS NULL FOR UPDATE`,
      [input.stationId, input.transactionId])
    if (identity.rows[0]?.fiscal_document_id !== tx.fiscal_document_id) {
      throw new Error('Fiscal document changed during receipt refresh')
    }
    const updated = await txQuery(client,
      `UPDATE receipts SET
         receipt_number = $3,
         plain_text_content = $4,
         html_content = NULL,
         fiscal_data = $5::jsonb,
         render_version = $6
       WHERE id = (
         SELECT id FROM receipts WHERE station_id = $1::uuid
           AND transaction_id = $2::uuid
         ORDER BY generated_at DESC, id DESC LIMIT 1
       ) AND station_id = $1::uuid AND transaction_id = $2::uuid
       RETURNING id`,
      [input.stationId, input.transactionId, documentNumber,
       built.text, JSON.stringify(fiscalData), 1])
    if (updated.rowCount !== 1) {
      throw new Error('No persisted receipt exists for Kenya refresh')
    }
  })
}
