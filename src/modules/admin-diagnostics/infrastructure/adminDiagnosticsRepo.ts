import { query, queryOne } from '@/src/platform/db/postgres'

export async function checkDiagnosticsDb() {
  return await queryOne<{ ok: number }>('SELECT 1 as ok')
}

export async function listPosCommandStatusCounts(stationId: string) {
  return await query<any>(
    `
    SELECT status, COUNT(*)::text AS count
    FROM pos_commands
    WHERE station_id = $1
    GROUP BY status
    ORDER BY status
    `,
    [stationId],
  ).catch(() => [])
}

export async function listPrintJobStatusCounts(stationId: string) {
  return await query<any>(
    `
    SELECT status, COUNT(*)::text AS count
    FROM print_jobs
    WHERE station_id = $1
    GROUP BY status
    ORDER BY status
    `,
    [stationId],
  ).catch(() => [])
}

export async function listRecentDiagnosticErrors(stationId: string) {
  return {
    posCommands: await query<any>(
      `
      SELECT id, status, updated_at, cmd, error_message
      FROM pos_commands
      WHERE station_id = $1 AND status = 'FAILED'
      ORDER BY updated_at DESC
      LIMIT 25
      `,
      [stationId],
    ).catch(() => []),
    printJobs: await query<any>(
      `
      SELECT id, status, updated_at, type, error_message
      FROM print_jobs
      WHERE station_id = $1 AND status = 'FAILED'
      ORDER BY updated_at DESC
      LIMIT 25
      `,
      [stationId],
    ).catch(() => []),
    controlEvents: await query<any>(
      `
      SELECT id, action, status, created_at, completed_at, error_message
      FROM process_control_events
      WHERE station_id = $1
      ORDER BY created_at DESC
      LIMIT 25
      `,
      [stationId],
    ).catch(() => []),
  }
}

export async function listTransactionsByStatus(stationId: string) {
  return await query<{ status: string; count: string }>(
    `
    SELECT status, COUNT(*)::text AS count
    FROM transactions
    WHERE station_id = $1 AND deleted_at IS NULL
    GROUP BY status
    ORDER BY status
    `,
    [stationId],
  )
}

export async function countPendingCustomerTransactions(stationId: string) {
  return await queryOne<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM transactions
    WHERE station_id = $1
      AND deleted_at IS NULL
      AND status IN ('OPEN')
      AND (customer_id IS NULL)
    `,
    [stationId],
  )
}

export async function listRecentControlEvents(stationId: string) {
  return await query<any>(
    `
    SELECT id, action, status, created_at
    FROM process_control_events
    WHERE station_id = $1
    ORDER BY created_at DESC
    LIMIT 25
    `,
    [stationId],
  )
}
