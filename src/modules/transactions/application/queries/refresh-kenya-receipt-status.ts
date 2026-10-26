import { queryOne } from '@/src/platform/db/postgres'
import { getKenyaInvoiceStatusViaProxy } from '@/src/shared/proxy/client'

/** Explicit, read-only Kenya proxy lookup. Does not mutate transaction status. */
export async function refreshKenyaReceiptStatus(
  stationId: string,
  transactionId: string,
): Promise<unknown> {
  const tx = await queryOne<{
    country: string | null
    fiscal_document_id: string | null
    pos_reference: string | null
  }>(
    `SELECT fs.country, t.fiscal_document_id, t.pos_reference
       FROM transactions t
       JOIN fuel_stations fs ON fs.id = t.station_id
      WHERE t.station_id = $1::uuid
        AND t.id = $2::uuid
        AND t.deleted_at IS NULL LIMIT 1`,
    [stationId, transactionId],
  )
  if (!tx) throw new Error('Transaction not found')
  if (!['KE', 'KEN', 'KENYA'].includes(String(tx.country ?? '').trim().toUpperCase())) {
    return null
  }
  const documentId = String(tx.fiscal_document_id ?? tx.pos_reference ?? '').trim()
  if (!documentId) {
    throw new Error('Cannot refresh Kenya receipt without original fiscal document ID')
  }
  return await getKenyaInvoiceStatusViaProxy(stationId, documentId)
}
