import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/jpl/types'

import { query, queryAll } from '@/src/platform/db/postgres'
import { sendPosCommand } from '@/src/platform/integrations/posGateway'
import { advisoryUnlock, tryAdvisoryLock } from '@/src/shared/db/locks'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { logger } from '@/src/shared/utils/logger'

const WORKER_NAME = 'posCommandsWorker'
const DEFAULT_POLL_MS = 500
const HEARTBEAT_MS = 5_000

let started = false
let stopRequested = false
let loopTimer: NodeJS.Timeout | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let controller: { stop: () => void } | null = null

type PosCommandRow = {
  id: string
  station_id: string
  command: string
  payload: any
}

async function fetchNextBatch(limit = 10): Promise<PosCommandRow[]> {
  // Claim rows using SKIP LOCKED for safe concurrency if multiple worker processes exist.
  return await queryAll<PosCommandRow>(
    `WITH claimed AS (
			SELECT id
			  FROM pos_commands
			 WHERE status = 'PENDING'
			 ORDER BY requested_at ASC
			 FOR UPDATE SKIP LOCKED
			 LIMIT $1
		)
		UPDATE pos_commands pc
		   SET status = 'SENT', updated_at = NOW()
		  FROM claimed
		 WHERE pc.id = claimed.id
		RETURNING pc.id, pc.station_id, pc.command, pc.payload`,
    [limit],
  )
}

async function storeResult(commandId: string, result: PosCommandResult) {
  const status = result.ok ? 'COMPLETED' : 'FAILED'
  await query(
    `UPDATE pos_command_results
		   SET status = $2,
		       result_json = $3,
		       received_at = NOW(),
		       updated_at = NOW()
		 WHERE command_id = $1`,
    [commandId, status, result as any],
  )
  await query(
    `UPDATE pos_commands
		   SET status = $2,
		       updated_at = NOW()
		 WHERE id = $1`,
    [commandId, status],
  )
}

async function processOne(row: PosCommandRow) {
  let result: PosCommandResult
  try {
    const cmd: PosCommand = {
      type: row.command as any,
      payload: row.payload ?? {},
    }
    result = await sendPosCommand(row.station_id, cmd)
  } catch (e: any) {
    result = {
      ok: false,
      accepted: false,
      message: e?.message ?? 'DOMS command failed',
    }
  }
  await storeResult(row.id, result)

  // per-station heartbeat update (best effort)
  await upsertProcessHeartbeat({
    stationId: row.station_id,
    processName: WORKER_NAME,
    pid: process.pid,
    status: 'running',
    connected: true,
    metrics: { lastCommandId: row.id, lastCommandAt: new Date().toISOString() },
    lastError: result.ok ? null : (result.message ?? 'Command failed'),
  })
}

async function heartbeatAllStations() {
  // Light-weight heartbeat for stations that have ever had a worker heartbeat row.
  // We avoid scanning stations every time.
  const stations = await queryAll<{ station_id: string }>(
    `SELECT DISTINCT station_id FROM process_heartbeats WHERE process_name = $1`,
    [WORKER_NAME],
  )
  await Promise.all(
    stations.map((s) =>
      upsertProcessHeartbeat({
        stationId: s.station_id,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: { heartbeat: true },
        lastError: null,
      }),
    ),
  )
}

async function workerLoop() {
  // Ensure only one loop per DB cluster (best effort). If lock cannot be acquired, do nothing.
  if (!(await tryAdvisoryLock(`worker:${WORKER_NAME}`))) return
  try {
    // Claim + process batch within a transaction scope in the DB via FOR UPDATE.
    const claimed = await fetchNextBatch(10)
    for (const row of claimed) {
      await processOne(row)
    }
  } finally {
    await advisoryUnlock(`worker:${WORKER_NAME}`)
  }
}

/**
 * Start the background pos_commands worker in-process.
 *
 * This is intended for the current deployment model where Next runs as a long-lived
 * Node process (not serverless). For multi-process/clustered deploys, keep the DB
 * advisory lock enabled above.
 */
export function startPosCommandsWorker(opts?: { pollMs?: number }) {
  // Idempotent: return existing controller if already started
  if (started && controller) return controller
  started = true
  stopRequested = false

  const pollMs = Math.max(200, opts?.pollMs ?? DEFAULT_POLL_MS)

  // kick immediately
  workerLoop().catch((e) =>
    logger.error(`[${WORKER_NAME}]`, { msg: 'loop error', error: e }),
  )
  heartbeatAllStations().catch((e) =>
    logger.error(`[${WORKER_NAME}]`, { msg: 'heartbeat error', error: e }),
  )

  loopTimer = setInterval(() => {
    if (stopRequested) return
    workerLoop().catch((e) =>
      logger.error(`[${WORKER_NAME}]`, { msg: 'loop error', error: e }),
    )
  }, pollMs)

  heartbeatTimer = setInterval(() => {
    if (stopRequested) return
    heartbeatAllStations().catch((e) =>
      logger.error(`[${WORKER_NAME}]`, { msg: 'heartbeat error', error: e }),
    )
  }, HEARTBEAT_MS)

  controller = {
    stop: () => {
      stopRequested = true
      started = false
      if (loopTimer) clearInterval(loopTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      loopTimer = null
      heartbeatTimer = null
      controller = null
    },
  }
  return controller
}
