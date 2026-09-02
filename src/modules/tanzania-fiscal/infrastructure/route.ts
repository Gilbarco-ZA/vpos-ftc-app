import { queryOne } from '@/src/platform/db/postgres'

import {
  getStationCountryCode,
  isTanzaniaCountry,
  normalizeFiscalCountryCode,
} from './country'

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

export function normalizeConfiguredFiscalizationTransport(
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

export function normalizeFiscalizationTransport(
  _value: unknown,
): FiscalizationTransport {
  // TRA/EWURA traffic is now owned by the licensed cloud middleware and must
  // always leave the FTC app through vpos-proxy. Keep the legacy union value
  // for database and cutover diagnostics, but never select it as an
  // executable route.
  return 'proxy'
}

export function resolveFiscalizationDefaults(input: {
  country?: string | null
  fiscalizationEngine?: string | null
  fiscalizationTransport?: string | null
}) {
  const isTanzania = isTanzaniaCountry(input.country)
  const configuredEngine = String(input.fiscalizationEngine ?? '').trim()
  const usesGenericEngineDefault = ['mock', 'default', 'none'].includes(
    configuredEngine.toLowerCase(),
  )
  const shouldApplyTanzaniaDefaults =
    isTanzania && (!configuredEngine || usesGenericEngineDefault)

  return {
    fiscalizationEngine: shouldApplyTanzaniaDefaults
      ? 'TZ'
      : configuredEngine || (isTanzania ? 'TZ' : 'mock'),
    fiscalizationTransport: 'proxy' as const,
  }
}

export function isLocalTanzaniaTransport(_value: unknown): boolean {
  return false
}

export function resolveStationFiscalizationRoute(input: {
  stationId: string
  country: string | null
  fiscalizationEngine?: string | null
  fiscalizationTransport?: string | null
}): StationFiscalizationRoute {
  const country = normalizeFiscalCountryCode(input.country)
  const defaults = resolveFiscalizationDefaults({
    country,
    fiscalizationEngine: input.fiscalizationEngine,
    fiscalizationTransport: input.fiscalizationTransport,
  })
  const engine = defaults.fiscalizationEngine
  const transport = defaults.fiscalizationTransport
  const isTanzania = isTanzaniaCountry(country)
  const legacyLocalConfigured = String(input.fiscalizationTransport ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .includes('local')

  return {
    stationId: input.stationId,
    country,
    isTanzania,
    fiscalizationEngine: engine,
    fiscalizationTransport: transport,
    route: 'proxy',
    canUseLocalTanzania: false,
    reason: legacyLocalConfigured
      ? 'Local TRA/EWURA fiscalization is retired; requests are routed through vpos-proxy and the licensed cloud middleware.'
      : undefined,
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
      fiscalizationEngine: null,
      fiscalizationTransport: null,
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
  _stationId: string,
): Promise<boolean> {
  return false
}

export async function assertLocalTanzaniaFiscalizationRoute(stationId: string) {
  const route = await getStationFiscalizationRoute(stationId)
  throw new Error(
    route.reason ??
      'Direct TRA/EWURA fiscalization is disabled. Use vpos-proxy and the licensed cloud middleware.',
  )
}
