import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

export type JplTransactionRecoveryRunStatus =
  | 'started'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'

export type JplTransactionRecoveryRunRow = {
  id: string
  station_id: string
  requested_by: string | null
  trigger_source: string
  status: JplTransactionRecoveryRunStatus
  started_at: string
  completed_at: string | null
  rows_scanned: number
  retries_attempted: number
  clear_success_count: number
  blocked_count: number
  failed_count: number
  details_json: any
  last_error: string | null
  created_at: string
  updated_at: string
}

const sql = {
  createRun: `
    INSERT INTO forecourt_jpl_transaction_recovery_runs (
      id,
      station_id,
      requested_by,
      trigger_source,
      status,
      details_json
    )
    VALUES ($1, $2, $3, $4, 'started', COALESCE($5::jsonb, '{}'::jsonb))
    RETURNING id
  `,
  completeRun: `
    UPDATE forecourt_jpl_transaction_recovery_runs
       SET status = $2,
           completed_at = NOW(),
           rows_scanned = $3,
           retries_attempted = $4,
           clear_success_count = $5,
           blocked_count = $6,
           failed_count = $7,
           details_json = COALESCE($8::jsonb, '{}'::jsonb),
           last_error = $9,
           updated_at = NOW()
     WHERE id = $1
  `,
  listRecentByStation: `
    SELECT
      id,
      station_id,
      requested_by,
      trigger_source,
      status,
      started_at,
      completed_at,
      rows_scanned,
      retries_attempted,
      clear_success_count,
      blocked_count,
      failed_count,
      details_json,
      last_error,
      created_at,
      updated_at
    FROM forecourt_jpl_transaction_recovery_runs
    WHERE station_id = $1
    ORDER BY started_at DESC
    LIMIT $2
  `,
} as const

export const forecourtJplTransactionRecoveryRepo = {
  async createRun(args: {
    id: string
    stationId: string
    requestedBy?: string | null
    triggerSource: string
    detailsJson?: any
  }) {
    return await queryOne<{ id: string }>(sql.createRun, [
      args.id,
      args.stationId,
      args.requestedBy ?? null,
      args.triggerSource,
      args.detailsJson != null ? JSON.stringify(args.detailsJson) : null,
    ])
  },
  async completeRun(args: {
    id: string
    status: JplTransactionRecoveryRunStatus
    rowsScanned: number
    retriesAttempted: number
    clearSuccessCount: number
    blockedCount: number
    failedCount: number
    detailsJson?: any
    lastError?: string | null
  }) {
    await query(sql.completeRun, [
      args.id,
      args.status,
      args.rowsScanned,
      args.retriesAttempted,
      args.clearSuccessCount,
      args.blockedCount,
      args.failedCount,
      args.detailsJson != null ? JSON.stringify(args.detailsJson) : null,
      args.lastError ?? null,
    ])
  },
  async listRecentByStation(args: { stationId: string; limit?: number }) {
    return await queryAll<JplTransactionRecoveryRunRow>(
      sql.listRecentByStation,
      [args.stationId, Math.max(1, Math.min(50, Number(args.limit ?? 10)))],
    )
  },
}
