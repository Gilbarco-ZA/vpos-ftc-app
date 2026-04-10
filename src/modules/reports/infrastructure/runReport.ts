import type {
  ReportRequest,
  ReportResult,
} from '@/src/modules/reports/infrastructure/reportTypes'

import { queryOne } from '@/src/platform/db/postgres'

import { getReportsAdapter } from '@/src/modules/reports/infrastructure/adapters'

export async function runReport(req: ReportRequest): Promise<ReportResult> {
  // Reuse station fiscalization engine setting for reports as well.
  const row = await queryOne<any>(
    `SELECT fiscalization_engine FROM station_settings WHERE station_id = $1`,
    [req.stationId],
  )
  const engine = row?.fiscalization_engine ?? null
  const adapter = getReportsAdapter(engine)
  return await adapter.generateReport(req)
}
