import {
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { listForecourtPrices } from '../infrastructure/adminRepo'

export async function listAdminForecourtPrices(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const priceSetIdRaw = optionalNonEmptyString(searchParams.get('priceSetId'))
  const parsedPriceSetId = priceSetIdRaw ? Number(priceSetIdRaw) : null

  const rows = await listForecourtPrices({
    stationId: normalizedStationId,
    priceSetId: Number.isFinite(parsedPriceSetId as number)
      ? parsedPriceSetId
      : null,
  })

  return { ok: true, rows: Array.isArray(rows) ? rows : [] }
}
