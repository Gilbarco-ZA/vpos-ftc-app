import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { recomputeAndPersistDailyTotals } from '@/src/modules/transactions/infrastructure/dailyAggregate'

export async function recomputeDailyTotals(
  stationId: string,
  businessDate?: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedBusinessDate =
    businessDate == null || String(businessDate).trim() === ''
      ? undefined
      : String(businessDate).trim()

  return await recomputeAndPersistDailyTotals(
    scopedStationId,
    scopedBusinessDate,
  )
}
