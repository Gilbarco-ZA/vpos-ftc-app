import { withTransaction, txQuery } from '@/src/platform/db/postgres'
import { KENYA_SITE_CONFIG_KEY } from './siteConfiguration'

/** Station-scoped, transaction-idempotent numbering. Never reuse an allocated number. */
export async function ensureKenyaOfflineReceiptNumber(stationId: string, transactionId: string): Promise<number> {
  return withTransaction(async client => {
    const rows = await txQuery(client,
      `SELECT value FROM station_kv WHERE station_id = $1::uuid AND key = $2 FOR UPDATE`,
      [stationId, KENYA_SITE_CONFIG_KEY])
    const config = rows.rows[0]?.value as Record<string, unknown> | undefined
    if (!config || config.countryCode !== 'KE') throw new Error('Verified Kenya site configuration required')
    const assignments = await txQuery(client,
      `SELECT value FROM station_kv WHERE station_id = $1::uuid AND key = $2`,
      [stationId, 'kenya.fiscal.offline.number.' + transactionId])
    const saved = Number(assignments.rows[0]?.value?.receiptNumber)
    if (Number.isSafeInteger(saved) && saved > 0) return saved
    const next = Number(config.nextDocumentNumber)
    if (!Number.isSafeInteger(next) || next < 1) throw new Error('Invalid Kenya next document number')
    await txQuery(client,
      `INSERT INTO station_kv (station_id, key, value) VALUES ($1::uuid, $2, $3::jsonb)
       ON CONFLICT (station_id, key) DO NOTHING`,
      [stationId, 'kenya.fiscal.offline.number.' + transactionId,
       JSON.stringify({ receiptNumber: next })])
    await txQuery(client,
      `UPDATE station_kv SET value = jsonb_set(value, '{nextDocumentNumber}', to_jsonb($3::bigint)), updated_at = NOW()
       WHERE station_id = $1::uuid AND key = $2`,
      [stationId, KENYA_SITE_CONFIG_KEY, next + 1])
    return next
  })
}
