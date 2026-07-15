import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/adapters/types'

import { queryOne as pgOne } from '@/src/platform/db/postgres'

import {
  getStationCountryCode,
  isTanzaniaCountry,
} from '@/src/modules/tanzania-fiscal/infrastructure/country'
import { assertLocalTanzaniaFiscalizationRoute } from '@/src/modules/tanzania-fiscal/infrastructure/route'
import { getFiscalAdapter } from '@/src/modules/transactions/infrastructure/fiscalization/adapters'

export type { FiscalRunResult }

/**
 * Runs the DB-backed in-app fiscalization adapter.
 *
 * Production Tanzania local mode is selected per station by
 * station_settings.fiscalization_transport = 'local_tz'. Developer/test
 * environment flags no longer decide the site route; they only remain as a
 * legacy escape hatch for non-Tanzania internal adapter testing.
 */
export const runFiscalization = async (params: {
  stationId: string
  transaction: any
  customer: any | null
}): Promise<FiscalRunResult> => {
  const settings = await pgOne<any>(
    `SELECT fiscalization_engine, fiscalization_transport, proxy_url
     FROM station_settings
     WHERE station_id = $1`,
    [params.stationId],
  )

  const engine = String(settings?.fiscalization_engine || 'mock')
  const normalizedEngine = engine.toUpperCase()

  if (normalizedEngine === 'TZ') {
    await assertLocalTanzaniaFiscalizationRoute(params.stationId)
  } else {
    const country = await getStationCountryCode(params.stationId)
    if (isTanzaniaCountry(country)) {
      throw new Error(
        `Tanzania stations must use fiscalization_engine TZ for local fiscalization. Current engine: ${engine}.`,
      )
    }

    const hasProxy =
      settings?.proxy_url != null &&
      String(settings.proxy_url).trim().length > 0
    const allowInternalForDeveloperTesting =
      String(
        process.env.VPOS_ALLOW_INTERNAL_FISCALIZATION || '',
      ).toLowerCase() === 'true'

    if (!allowInternalForDeveloperTesting && hasProxy) {
      throw new Error(
        'Internal fiscalization is disabled for proxy/cloud stations. Use the proxy sender worker or set the station route to local_tz for Tanzania.',
      )
    }
  }

  const adapter = getFiscalAdapter(engine)

  return adapter.run({
    stationId: params.stationId,
    transaction: params.transaction,
    customer: params.customer,
  })
}
