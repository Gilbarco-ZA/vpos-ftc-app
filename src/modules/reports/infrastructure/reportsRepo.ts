import { queryAll, queryOne } from '@/src/platform/db/postgres'

import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'

export async function listReportsRepo(stationId: string, limit = 200) {
  return await queryAll<any>(
    `SELECT * FROM reports WHERE station_id = $1 ORDER BY report_date_time DESC NULLS LAST, created_at DESC LIMIT $2`,
    [stationId, limit],
  )
}

export async function listPendingReportsRepo(stationId: string) {
  return await queryAll<any>(
    `SELECT * FROM report_queue WHERE station_id = $1 AND status IN ('PENDING','PROCESSING','FAILED') ORDER BY created_at DESC LIMIT 200`,
    [stationId],
  )
}

export async function getReportByIdRepo(stationId: string, reportId: string) {
  return await queryOne<any>(
    `SELECT * FROM reports WHERE station_id = $1 AND id = $2`,
    [stationId, reportId],
  )
}

export async function getReportSummaryTotals(
  stationId: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  const rows = await queryOne<any>(
    `SELECT COUNT(*)::int AS total_reports,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_reports,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_reports,
            MIN(report_date_time) AS first_report_at,
            MAX(report_date_time) AS last_report_at
       FROM reports
      WHERE station_id = $1
        AND ($2::timestamptz IS NULL OR report_date_time >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR report_date_time <= $3::timestamptz)`,
    [stationId, startDate ?? null, endDate ?? null],
  )
  return (
    rows ?? {
      total_reports: 0,
      completed_reports: 0,
      failed_reports: 0,
      first_report_at: null,
      last_report_at: null,
    }
  )
}

export async function listTransactionsCsvRows(
  stationId: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  return await queryAll<any>(
    `SELECT id, transaction_date_time, pos_reference, pump_number, fuel_type, volume, total_amount, status, fiscalization_reference
       FROM transactions
      WHERE station_id = $1
        AND deleted_at IS NULL
        AND ($2::timestamptz IS NULL OR transaction_date_time >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR transaction_date_time <= $3::timestamptz)
      ORDER BY transaction_date_time DESC`,
    [stationId, startDate ?? null, endDate ?? null],
  )
}

export async function getReportsReportingRepo(stationId: string) {
  const summary = await getReportSummaryTotals(stationId)
  const pending = await queryOne<any>(
    `SELECT COUNT(*)::int AS pending_reports FROM report_queue WHERE station_id = $1 AND status IN ('PENDING','PROCESSING')`,
    [stationId],
  )
  return { ...summary, pendingReports: Number(pending?.pending_reports ?? 0) }
}

export async function getTransactionReportingRepo(stationId: string) {
  return await queryOne<any>(
    `SELECT COUNT(*)::int AS total_transactions,
            COUNT(*) FILTER (WHERE fiscalized_at IS NOT NULL)::int AS fiscalized_transactions,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_transactions,
            COALESCE(SUM(total_amount), 0)::numeric AS gross_amount
       FROM transactions
      WHERE station_id = $1 AND deleted_at IS NULL`,
    [stationId],
  )
}

export async function enqueueReportPrintRepo(
  stationId: string,
  reportId: string,
) {
  return await enqueuePrintJob(stationId, 'print.report', {}, 0, {
    idempotencyKey: `report:${reportId}`,
    sourceReportId: reportId,
    payloadMode: 'reference',
  })
}
