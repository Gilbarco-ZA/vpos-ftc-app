import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listPendingReportsRepo } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function listPendingReports(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const rows = await listPendingReportsRepo(scopedStationId)
  return Array.isArray(rows) ? rows : []
}
