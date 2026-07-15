import { queryOne } from '@/src/platform/db/postgres'

import { getStationCountryCode, isTanzaniaCountry } from './country'

export const FISCALIZATION_TRANSPORTS = ['proxy', 'local_tz'] as const

export type FiscalizationTransport = (typeof FISCALIZATION_TRANSPORTS)[number]

export type StationFiscalizationRoute = {
  stationId: string
  country: string | null
  isTanzania: boolean
  fiscalizationEngine: string
  fiscalizationTransport: FiscalizationTransport
  route: FiscalizationTransport
  canUseLocalTanzania: boolean
  reason?: string
}

export function normalizeFiscalizationTransport(
  value: unknown,
): FiscalizationTransport {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')

  if (
    normalized === 'local_tz' ||
    normalized === 'local_tanzania' ||
    normalized === 'tanzania_local' ||
    normalized === 'fiscal_tz'
  ) {
    return 'local_tz'
  }

  return 'proxy'
}

export function isLocalTanzaniaTransport(value: unknown): boolean {
  return normalizeFiscalizationTransport(value) === 'local_tz'
}

export function resolveStationFiscalizationRoute(input: {
  stationId: string
  country: string | null
  fiscalizationEngine?: string | null
  fiscalizationTransport?: string | null
}): StationFiscalizationRoute {
  const country = input.country
    ? String(input.country).trim().toUpperCase()
    : null
  const engine = String(input.fiscalizationEngine || 'mock').trim() || 'mock'
  const transport = normalizeFiscalizationTransport(
    input.fiscalizationTransport,
  )
  const isTanzania = isTanzaniaCountry(country)
  const isTzEngine = engine.toUpperCase() === 'TZ'
  const canUseLocalTanzania = isTanzania && isTzEngine

  if (transport === 'local_tz' && !canUseLocalTanzania) {
    return {
      stationId: input.stationId,
      country,
      isTanzania,
      fiscalizationEngine: engine,
      fiscalizationTransport: transport,
      route: 'proxy',
      canUseLocalTanzania,
      reason: isTanzania
        ? `Local Tanzania fiscalization requires fiscalization_engine TZ. Current engine: ${engine}.`
        : `Local Tanzania fiscalization is only valid for Tanzania stations. Current country: ${country || 'not configured'}.`,
    }
  }

  return {
    stationId: input.stationId,
    country,
    isTanzania,
    fiscalizationEngine: engine,
    fiscalizationTransport: transport,
    route: transport,
    canUseLocalTanzania,
  }
}

export async function getStationFiscalizationRoute(
  stationId: string,
): Promise<StationFiscalizationRoute> {
  const row = await queryOne<{
    country: string | null
    fiscalization_engine: string | null
    fiscalization_transport: string | null
  }>(
    `SELECT COALESCE(
              NULLIF(BTRIM(fs.country), ''),
              NULLIF(BTRIM(sc.config_json #>> '{config,country}'), ''),
              NULLIF(BTRIM(sc.config_json #>> '{country}'), '')
            ) AS country,
            ss.fiscalization_engine,
            ss.fiscalization_transport
       FROM fuel_stations fs
       LEFT JOIN station_config sc ON sc.station_id = fs.id
       LEFT JOIN station_settings ss ON ss.station_id = fs.id
      WHERE fs.id = $1
      LIMIT 1`,
    [stationId],
  )

  if (!row) {
    const country = await getStationCountryCode(stationId)
    return resolveStationFiscalizationRoute({
      stationId,
      country,
      fiscalizationEngine: 'mock',
      fiscalizationTransport: 'proxy',
    })
  }

  return resolveStationFiscalizationRoute({
    stationId,
    country: row.country,
    fiscalizationEngine: row.fiscalization_engine,
    fiscalizationTransport: row.fiscalization_transport,
  })
}

export async function shouldUseLocalTanzaniaFiscalization(
  stationId: string,
): Promise<boolean> {
  const route = await getStationFiscalizationRoute(stationId)
  return route.route === 'local_tz'
}

export async function assertLocalTanzaniaFiscalizationRoute(stationId: string) {
  const route = await getStationFiscalizationRoute(stationId)
  if (route.route !== 'local_tz') {
    throw new Error(
      route.reason ??
        `Internal Tanzania fiscalization is disabled for this station. Current fiscalization route: ${route.route}.`,
    )
  }
  return route
}
