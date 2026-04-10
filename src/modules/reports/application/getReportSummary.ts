import {
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getReportSummaryTotals } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function getReportSummary(
  stationId: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  return await getReportSummaryTotals(
    requireNonEmptyString(stationId, 'stationId'),
    optionalNonEmptyString(startDate) ?? null,
    optionalNonEmptyString(endDate) ?? null,
  )
}
