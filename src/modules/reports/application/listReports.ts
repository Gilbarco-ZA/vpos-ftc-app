import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'

import { listReportsRepo } from '@/src/modules/reports/infrastructure/reportsRepo'

export async function listReports(stationId: string, limit?: number) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const normalizedLimit = toPositiveInt(limit, 200, 500)
  return await listReportsRepo(scopedStationId, normalizedLimit)
}
