import { queryOne } from '@/src/platform/db/postgres'

const TANZANIA_CODES = new Set([
  'TZ',
  'TZA',
  'TANZANIA',
  'UNITED REPUBLIC OF TANZANIA',
])

export function isTanzaniaCountry(value: unknown): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  return TANZANIA_CODES.has(normalized)
}

export async function getStationCountryCode(
  stationId: string,
): Promise<string | null> {
  const row = await queryOne<{ country: string | null }>(
    `SELECT COALESCE(
              NULLIF(BTRIM(fs.country), ''),
              NULLIF(BTRIM(sc.config_json #>> '{config,country}'), ''),
              NULLIF(BTRIM(sc.config_json #>> '{country}'), '')
            ) AS country
       FROM fuel_stations fs
       LEFT JOIN station_config sc ON sc.station_id = fs.id
      WHERE fs.id = $1
      LIMIT 1`,
    [stationId],
  )

  return row?.country ? String(row.country).trim().toUpperCase() : null
}

export async function assertStationIsTanzania(stationId: string) {
  const country = await getStationCountryCode(stationId)
  if (!isTanzaniaCountry(country)) {
    throw new Error(
      `Tanzania fiscalization is only available for Tanzania stations (station country: ${country || 'not configured'}).`,
    )
  }
  return country
}
