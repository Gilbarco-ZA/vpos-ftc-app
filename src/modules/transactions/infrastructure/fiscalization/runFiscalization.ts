import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/adapters/types'

import { queryOne as pgOne } from '@/src/platform/db/postgres'

import { getFiscalAdapter } from '@/src/modules/transactions/infrastructure/fiscalization/adapters'

export type { FiscalRunResult }

/**
 * Legacy internal fiscalization adapter runner.
 *
 * In proxy fiscal flow deployments, fiscalization is performed by the proxy/cloud,
 * so this function is intentionally guarded to prevent accidental use in production.
 *
 * To override (e.g., dev/test), set:
 *   VPOS_ALLOW_INTERNAL_FISCALIZATION=true
 */
export const runFiscalization = async (params: {
  stationId: string
  transaction: any
  customer: any | null
}): Promise<FiscalRunResult> => {
  const settings = await pgOne<any>(
    `SELECT fiscalization_engine, proxy_url
     FROM station_settings
     WHERE station_id = $1`,
    [params.stationId],
  )

  const flow = String(process.env.VPOS_FISCAL_FLOW || '').toLowerCase()
  const hasProxy =
    settings?.proxy_url != null && String(settings.proxy_url).trim().length > 0
  const allowInternal =
    String(
      process.env.VPOS_ALLOW_INTERNAL_FISCALIZATION || '',
    ).toLowerCase() === 'true'

  if (!allowInternal && (flow === 'proxy' || hasProxy)) {
    throw new Error(
      'Internal fiscalization is disabled when proxy fiscal flow is enabled. Use the proxy sender worker.',
    )
  }

  const engine = String(settings?.fiscalization_engine || 'mock')
  const adapter = getFiscalAdapter(engine)

  return adapter.run({
    stationId: params.stationId,
    transaction: params.transaction,
    customer: params.customer,
  })
}
