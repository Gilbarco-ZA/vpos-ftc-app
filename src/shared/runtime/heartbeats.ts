import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

export type ProcessHeartbeat = {
  stationId: string
  processName: string
  pid?: number | null
  status: string
  connected: boolean
  metrics: unknown
  lastError?: string | null
  restartCount: number
  lastHeartbeatAt: string
}

export async function upsertProcessHeartbeat(input: {
  stationId: string
  processName: string
  pid?: number | null
  status?: string
  connected?: boolean
  metrics?: unknown
  lastError?: string | null
  restartCount?: number
}) {
  const {
    stationId,
    processName,
    pid = null,
    status = 'unknown',
    connected = false,
    metrics = {},
    lastError = null,
    restartCount = 0,
  } = input

  await query(
    `INSERT INTO process_heartbeats
       (station_id, process_name, pid, status, connected, metrics, last_error, restart_count, last_heartbeat_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
     ON CONFLICT (station_id, process_name)
     DO UPDATE SET
       pid = EXCLUDED.pid,
       status = EXCLUDED.status,
       connected = EXCLUDED.connected,
       metrics = EXCLUDED.metrics,
       last_error = EXCLUDED.last_error,
       restart_count = EXCLUDED.restart_count,
       last_heartbeat_at = NOW(),
       updated_at = NOW()`,
    [
      stationId,
      processName,
      pid,
      status,
      connected,
      metrics,
      lastError,
      restartCount,
    ],
  )
}

export async function getProcessHeartbeat(
  stationId: string,
  processName: string,
) {
  return await queryOne<ProcessHeartbeat>(
    `SELECT station_id as "stationId",
            process_name as "processName",
            pid,
            status,
            connected,
            metrics,
            last_error as "lastError",
            restart_count as "restartCount",
            last_heartbeat_at as "lastHeartbeatAt"
       FROM process_heartbeats
      WHERE station_id = $1 AND process_name = $2`,
    [stationId, processName],
  )
}

export async function getAllProcessHeartbeats(
  stationId: string,
): Promise<ProcessHeartbeat[]> {
  return await queryAll<ProcessHeartbeat>(
    `SELECT station_id as "stationId",
            process_name as "processName",
            pid,
            status,
            connected,
            metrics,
            last_error as "lastError",
            restart_count as "restartCount",
            last_heartbeat_at as "lastHeartbeatAt"
       FROM process_heartbeats
      WHERE station_id = $1`,
    [stationId],
  )
}

export async function clearProcessErrors(stationId: string) {
  await query(
    `UPDATE process_heartbeats
        SET last_error = NULL,
            updated_at = NOW()
      WHERE station_id = $1`,
    [stationId],
  )
}
