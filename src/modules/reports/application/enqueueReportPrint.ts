import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { enqueueReportPrintRepo } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function enqueueReportPrint(stationId: string, reportId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedReportId = requireNonEmptyString(reportId, 'reportId')
  return await enqueueReportPrintRepo(scopedStationId, scopedReportId)
}
