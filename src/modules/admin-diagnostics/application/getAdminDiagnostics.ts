import { ok } from '@/src/platform/web/api/response'
import { getAllProcessHeartbeats } from '@/src/shared/runtime/heartbeats'
import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { getAdminStatus } from '@/src/modules/admin-diagnostics/application/getAdminStatus'
import {
  checkDiagnosticsDb,
  listPosCommandStatusCounts,
  listPrintJobStatusCounts,
  listRecentDiagnosticErrors,
} from '@/src/modules/admin-diagnostics/infrastructure/adminDiagnosticsRepo'

export async function getAdminDiagnostics(stationId: string) {
  const dbOk = await safeAsync(checkDiagnosticsDb(), 'diagnostics.dbCheck')
  const adminStatus = await safeAsync(
    getAdminStatus(stationId),
    'diagnostics.adminStatus',
  )
  const heartbeats =
    (await safeAsync(
      getAllProcessHeartbeats(stationId),
      'diagnostics.heartbeats',
    )) ?? []
  const supervisor = await safeAsync(
    getRuntimeManager(stationId).status(),
    'diagnostics.supervisor',
  )
  const posCommands = await listPosCommandStatusCounts(stationId)
  const printJobs = await listPrintJobStatusCounts(stationId)
  const lastErrors = await listRecentDiagnosticErrors(stationId)

  return ok({
    stationId,
    ts: new Date().toISOString(),
    db: { ok: !!dbOk?.ok },
    runtime: { supervisor, heartbeats },
    queues: { posCommands, printJobs },
    lastErrors,
    adminStatus,
  })
}
