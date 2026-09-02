import { query } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'

import { runStorageRetention } from './storageRetention'
import { getStationStorageRetentionPolicy } from './storageRetentionPolicy'

const POLICY_REFRESH_MS = 60_000

async function pruneSuccessfulPrinterTestJobs(
  stationId: string,
  retentionDays: number,
  dryRun: boolean,
) {
  if (retentionDays <= 0) return { examined: 0, deleted: 0 }

  if (dryRun) {
    const result = await query(
      `SELECT id
         FROM print_jobs
        WHERE station_id = $1::uuid
          AND status = 'DONE'
          AND completed_at IS NOT NULL
          AND job_type LIKE 'setup.%'
          AND completed_at < NOW() - ($2 * INTERVAL '1 day')
        LIMIT 500`,
      [stationId, retentionDays],
    )
    return { examined: result.rowCount ?? 0, deleted: 0 }
  }

  const result = await query(
    `DELETE FROM print_jobs
      WHERE id IN (
        SELECT id
          FROM print_jobs
         WHERE station_id = $1::uuid
           AND status = 'DONE'
           AND completed_at IS NOT NULL
           AND job_type LIKE 'setup.%'
           AND completed_at < NOW() - ($2 * INTERVAL '1 day')
         ORDER BY completed_at, id
         LIMIT 500
      )`,
    [stationId, retentionDays],
  )
  const deleted = result.rowCount ?? 0
  return { examined: deleted, deleted }
}

export async function runStationStorageRetention(stationId: string) {
  const policy = await getStationStorageRetentionPolicy(stationId)
  if (!policy.enabled) {
    return {
      enabled: false,
      dryRun: policy.dryRun,
      policy,
      retention: null,
      printTestJobs: { examined: 0, deleted: 0 },
    }
  }

  const retention = await runStorageRetention({ stationId, policy })
  const printTestJobs = await pruneSuccessfulPrinterTestJobs(
    stationId,
    policy.printTestDoneDays,
    policy.dryRun,
  )
  return { enabled: true, dryRun: policy.dryRun, policy, retention, printTestJobs }
}

let started = false
let timer: NodeJS.Timeout | null = null
let stopHandle: { stop: () => void } | null = null

export function startStationStorageRetentionWorker(stationId: string) {
  if (started && stopHandle) return stopHandle
  started = true
  let lastRunAt = 0

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
    started = false
    stopHandle = null
  }
  stopHandle = { stop }

  const tick = async () => {
    try {
      const policy = await getStationStorageRetentionPolicy(stationId)
      if (!policy.enabled) return
      const now = Date.now()
      if (lastRunAt && now - lastRunAt < policy.cleanupIntervalMs) return
      lastRunAt = now
      const result = await runStationStorageRetention(stationId)
      logger.info('[storageRetention]', {
        stationId,
        source: 'station-settings',
        dryRun: result.dryRun,
        deleted: result.retention?.deleted ?? 0,
        printTestDeleted: result.printTestJobs.deleted,
      })
    } catch (error) {
      logger.error('[storageRetention]', {
        msg: 'Station-managed storage retention run failed',
        stationId,
        error,
      })
    }
  }

  void tick()
  timer = setInterval(() => void tick(), POLICY_REFRESH_MS)
  timer.unref?.()
  return stopHandle
}
