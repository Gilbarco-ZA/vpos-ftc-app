import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getTransactionReportingRepo } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function getTransactionReporting(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getTransactionReportingRepo(scopedStationId)
}
