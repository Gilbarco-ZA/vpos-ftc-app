import { queryOne } from '@/src/platform/db/postgres'

/** Keep receipt-printing routes independent of database infrastructure. */
export async function isPendingKenyaReceipt(stationId: string, transactionId: string): Promise<boolean> {
  const state = await queryOne<{ fiscalized_at: string | null; country: string | null }>(
    `SELECT t.fiscalized_at, fs.country FROM transactions t
     JOIN fuel_stations fs ON fs.id = t.station_id
     WHERE t.station_id = $1::uuid AND t.id = $2::uuid`,
    [stationId, transactionId],
  )
  return ['KE', 'KEN', 'KENYA'].includes(String(state?.country ?? '').trim().toUpperCase()) &&
    !state?.fiscalized_at
}
