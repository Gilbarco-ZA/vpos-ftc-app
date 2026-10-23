import { queryOne } from '@/src/platform/db/postgres'
import { getEnvValue } from '@/src/shared/config/envDb'

/** Explicit user-triggered, read-only Kenya proxy lookup. */
export async function refreshKenyaReceiptStatus(stationId: string, transactionId: string): Promise<unknown> {
  const tx = await queryOne<{ country: string | null; fiscal_document_id: string | null }>(
    `SELECT fs.country, t.fiscal_document_id
       FROM transactions t JOIN fuel_stations fs ON fs.id = t.station_id
      WHERE t.station_id = $1::uuid AND t.id = $2::uuid
        AND t.deleted_at IS NULL LIMIT 1`, [stationId, transactionId])
  if (!tx) throw new Error('Transaction not found')
  if (!['KE', 'KEN', 'KENYA'].includes(String(tx.country ?? '').trim().toUpperCase())) return null
  const documentId = String(tx.fiscal_document_id ?? '').trim()
  if (!documentId) throw new Error('Cannot refresh Kenya receipt without original fiscal document ID')
  const proxyBase = String(await getEnvValue(stationId, 'VPOS_PROXY_URL', 'http://127.0.0.1:5555')).replace(/\/+$/, '')
  const prefix = String(await getEnvValue(stationId, 'VPOS_PROXY_BASE_PATH', '/')).replace(/^\/?/, '/').replace(/\/+$/, '')
  const url = new URL(proxyBase + prefix + '/api/invoices/status')
  url.searchParams.set('documentId', documentId)
  const response = await fetch(url, {
    method: 'GET', cache: 'no-store', headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Kenya receipt status refresh failed (' + response.status + ')')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object') throw new Error('Invalid Kenya receipt status response')
  const envelope = data as Record<string, unknown>
  if (envelope.error === true || !Array.isArray(envelope.invoices)) {
    throw new Error('Proxy did not return Kenya invoice status results')
  }
  const matches = envelope.invoices.filter((entry): entry is Record<string, unknown> =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry) &&
    entry.documentId === documentId)
  if (matches.length !== 1) throw new Error('Proxy status did not uniquely match original fiscal document ID')
  return matches[0]
}
