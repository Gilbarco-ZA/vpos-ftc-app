import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getReportsReportingRepo } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function getReportsReporting(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getReportsReportingRepo(scopedStationId)
}
