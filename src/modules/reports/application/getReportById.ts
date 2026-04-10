import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getReportByIdRepo } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function getReportById(stationId: string, reportId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedReportId = requireNonEmptyString(reportId, 'reportId')
  return await getReportByIdRepo(scopedStationId, scopedReportId)
}
