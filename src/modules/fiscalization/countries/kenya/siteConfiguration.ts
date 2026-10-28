import { query, queryOne } from '@/src/platform/db/postgres'
import { getStationCountryCode } from '@/src/modules/tanzania-fiscal/application/country'
import { getSiteConfigurationPublic } from '@/src/shared/proxy/client'

export const KENYA_SITE_CONFIG_KEY = 'kenya.fiscal.site.configuration'
export type KenyaSiteConfiguration = {
  countryCode: 'KE'
  tin: string
  branchId: string
  sdcId: string
  nextDocumentNumber: number
  fetchedAt: string
}

export function parseKenyaSiteConfiguration(raw: unknown): Omit<KenyaSiteConfiguration, 'fetchedAt'> {
  const response = raw as Record<string, unknown> | null
  const data = response?.configuration as Record<string, unknown> | null
  if (!response || response.error === true || String(response.countryCode ?? '').toUpperCase() !== 'KE' || !data) {
    throw new Error('Proxy site configuration is not a valid Kenya configuration')
  }
  const tin = String(data.tin ?? '').trim()
  const branchId = String(data.branchId ?? '').trim()
  const sdcId = String(data.sdcId ?? '').trim()
  const nextDocumentNumber = Number(data.nextDocumentNumber)
  if (!tin || !branchId || !sdcId || !Number.isSafeInteger(nextDocumentNumber) || nextDocumentNumber < 0) {
    throw new Error('Kenya proxy site configuration is incomplete')
  }
  return { countryCode: 'KE', tin, branchId, sdcId, nextDocumentNumber }
}

export async function readKenyaSiteConfiguration(stationId: string): Promise<KenyaSiteConfiguration | null> {
  const row = await queryOne<{ value: KenyaSiteConfiguration }>(
    `SELECT value FROM station_kv WHERE station_id = $1::uuid AND key = $2`,
    [stationId, KENYA_SITE_CONFIG_KEY],
  )
  return row?.value ?? null
}

export async function fetchAndSaveKenyaSiteConfiguration(stationId: string): Promise<KenyaSiteConfiguration> {
  const country = await getStationCountryCode(stationId)
  if (country !== 'KE') throw new Error('Kenya fiscal configuration is available only for Kenya stations')
  const response = await getSiteConfigurationPublic()
  if (!response.ok) throw new Error('Could not fetch site configuration from proxy')
  const verified = parseKenyaSiteConfiguration(response.data)
  const value = { ...verified, fetchedAt: new Date().toISOString() }
  await query(
    `INSERT INTO station_kv (station_id, key, value)
     VALUES ($1::uuid, $2, $3::jsonb)
     ON CONFLICT (station_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [stationId, KENYA_SITE_CONFIG_KEY, JSON.stringify(value)],
  )
  return value
}
