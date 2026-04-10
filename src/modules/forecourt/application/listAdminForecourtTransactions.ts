import {
  optionalNonEmptyString,
  requireNonEmptyString,
  toPositiveInt,
} from '@/src/shared/utils/inputs'

import { listForecourtTransactions } from '../infrastructure/adminRepo'

export async function listAdminForecourtTransactions(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const limit = toPositiveInt(searchParams.get('limit'), 100, 500)
  const fpIdRaw = optionalNonEmptyString(searchParams.get('fpId'))
  const since = optionalNonEmptyString(searchParams.get('since'))
  const parsedFpId = fpIdRaw ? Number(fpIdRaw) : null

  const rows = await listForecourtTransactions({
    stationId: normalizedStationId,
    limit,
    fpId: Number.isFinite(parsedFpId as number) ? parsedFpId : null,
    since,
  })

  return { ok: true, rows: Array.isArray(rows) ? rows : [] }
}
