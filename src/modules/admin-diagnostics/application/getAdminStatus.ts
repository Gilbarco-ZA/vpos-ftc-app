import { queryOne } from '@/src/platform/db/postgres'
import { getAllProcessHeartbeats } from '@/src/shared/runtime/heartbeats'
import { getSetupFlags, getSetupStatus } from '@/src/shared/setup/storage'
import { kvGet } from '@/src/shared/storage/stationKv'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { getRuntimeManager } from '@/src/modules/runtime/application/runtimeManager'

export async function getAdminStatus(stationId: string) {
  const setupFlags = await getSetupFlags(stationId)
  const setupStatus = await getSetupStatus(stationId)

  const pendingPrintJobs = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM print_jobs
      WHERE station_id = $1 AND status = 'PENDING'`,
    [stationId],
  )

  const posCommandCounts = await safeAsync(
    queryOne<{
      pending: string
      sent: string
      completed: string
      failed: string
    }>(
      `SELECT
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)::text as pending,
          SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END)::text as sent,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)::text as completed,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::text as failed
        FROM pos_commands
       WHERE station_id = $1`,
      [stationId],
    ),
    'adminStatus.posCommandCounts',
  )

  const pendingControlEvents = await safeAsync(
    queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM process_control_events
        WHERE station_id = $1 AND status = 'PENDING'`,
      [stationId],
    ),
    'adminStatus.pendingControlEvents',
  )

  const lastControlEvent = await safeAsync(
    queryOne<{
      id: string
      action: string
      status: string
      created_at: string
      error_message?: string | null
    }>(
      `SELECT id, action, status, created_at, error_message
         FROM process_control_events
        WHERE station_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [stationId],
    ),
    'adminStatus.lastControlEvent',
  )

  const runtimeState = await kvGet<any>(stationId, 'vpos.runtime.state')
  const runtimeDaily = await kvGet<any>(stationId, 'vpos.runtime.daily')
  const lastError = await kvGet<any>(stationId, 'vpos.runtime.lastError')

  const heartbeats =
    (await safeAsync(
      getAllProcessHeartbeats(stationId),
      'adminStatus.heartbeats',
    )) ?? []
  const supervisor = await safeAsync(
    getRuntimeManager(stationId).status(),
    'adminStatus.supervisorStatus',
  )

  return {
    success: true,
    data: {
      setupFlags: setupFlags.data,
      setupComplete: setupFlags.success,
      setupStatus: setupStatus.data,
      queues: {
        printJobsPending: Number(pendingPrintJobs?.count || 0),
        posCommands: {
          pending: Number(posCommandCounts?.pending ?? 0),
          sent: Number(posCommandCounts?.sent ?? 0),
          completed: Number(posCommandCounts?.completed ?? 0),
          failed: Number(posCommandCounts?.failed ?? 0),
        },
        processControlEventsPending: Number(pendingControlEvents?.count ?? 0),
        lastProcessControlEvent: lastControlEvent ?? null,
      },
      runtime: {
        state: runtimeState ?? null,
        daily: runtimeDaily ?? null,
        lastError: lastError ?? null,
        supervisor: supervisor ?? null,
        heartbeats: heartbeats ?? [],
      },
    },
  }
}
