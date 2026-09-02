import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { getRuntimeUptimeSeconds } from '@/src/platform/runtime/nodeProcess'
import { ok } from '@/src/platform/web/api/response'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import {
  checkDiagnosticsDb,
  countPendingCustomerTransactions,
  listPrintJobStatusCounts,
  listRecentControlEvents,
  listTransactionsByStatus,
} from '@/src/modules/admin-diagnostics/infrastructure/adminDiagnosticsRepo'

async function readPackageVersion() {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const raw = await fs.readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    return String(pkg?.version || '')
  } catch {
    return ''
  }
}

export async function getAdminDiagnosticsOverview(stationId: string) {
  const version = await readPackageVersion()
  const dbOk = await checkDiagnosticsDb()
  const txByStatus = await listTransactionsByStatus(stationId)
  const pendingCustomer = await countPendingCustomerTransactions(stationId)
  const printJobs =
    (await safeAsync(
      listPrintJobStatusCounts(stationId),
      'diagnostics.overview.printJobs',
    )) ?? []
  const lastControlEvents =
    (await safeAsync(
      listRecentControlEvents(stationId),
      'diagnostics.overview.controlEvents',
    )) ?? []

  const appBlock = {
    version,
    node: process.version,
    pid: process.pid,
    startedAt: new Date(
      Date.now() - getRuntimeUptimeSeconds() * 1000,
    ).toISOString(),
    uptimeSeconds: Math.floor(getRuntimeUptimeSeconds()),
  }

  const machineBlock = {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    uptimeSeconds: Math.floor(os.uptime()),
    load: os.loadavg(),
    mem: { total: os.totalmem(), free: os.freemem() },
    cpus: os.cpus()?.length ?? 0,
  }

  return ok({
    stationId,
    app: appBlock,
    machine: machineBlock,
    db: { ok: !!dbOk?.ok },
    counters: {
      transactionsByStatus: txByStatus,
      transactionsPendingCustomer: pendingCustomer?.count ?? '0',
      printJobsByStatus: printJobs,
    },
    cloudDelivery: { owner: 'vpos-proxy', legacyAzureSqlSync: 'retired' },
    control: { lastEvents: lastControlEvents },
    ts: new Date().toISOString(),
  })
}
