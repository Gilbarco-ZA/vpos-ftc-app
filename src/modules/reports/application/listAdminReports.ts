import { queryAll } from '@/src/platform/db/postgres'

export async function listAdminReports(stationId: string) {
  return queryAll<Record<string, unknown>>(
    `
      SELECT id, report_date_time, report_type, status, created_at, updated_at
      FROM reports
      WHERE station_id = $1
      ORDER BY report_date_time DESC
      LIMIT 200
    `,
    [stationId],
  )
}
