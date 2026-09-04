import { startPssXmlSyncWorker as startLegacyPssXmlSyncWorker } from '@/src/platform/integrations/pssXml/watcherWorker'

import { startAtgPollingWorker as startCanonicalAtgPollingWorker } from '@/src/modules/forecourt/infrastructure/atgPollingWorker'
import { startForecourtConfigSyncWorker as startLegacyForecourtConfigSyncWorker } from '@/src/modules/forecourt/infrastructure/configSync/worker'
import { startPosCommandsWorker as startCanonicalPosCommandsWorker } from '@/src/modules/pos/infrastructure/posCommandsWorker'
import { startPrintJobsWorker as startLegacyPrintJobsWorker } from '@/src/modules/printing/infrastructure/printJobsWorker'
import { startReportQueueWorker as startLegacyReportQueueWorker } from '@/src/modules/reports/infrastructure/reportQueueWorker'
import { startInProcessRuntime as startCanonicalInProcessRuntime } from '@/src/modules/runtime/infrastructure/inProcessRuntime'
import { startSupervisorMonitorWorker as startCanonicalSupervisorMonitorWorker } from '@/src/modules/runtime/infrastructure/supervisorMonitorWorker'
import { startEwuraRetryWorker as startCanonicalEwuraRetryWorker } from '@/src/modules/tanzania-fiscal/infrastructure/ewuraRetryWorker'
import { startTanzaniaDailyTotalsWorker as startCanonicalTanzaniaDailyTotalsWorker } from '@/src/modules/tanzania-fiscal/infrastructure/proxyDailyTotalsWorker'
import { publishLatestTanzaniaTankInventories } from '@/src/modules/tanzania-fiscal/infrastructure/proxyTankInventories'
import { startOfflineReceiptPrintWorker as startCanonicalOfflineReceiptPrintWorker } from '@/src/modules/transactions/infrastructure/fiscalization/offlineReceiptPrintWorker'
import { startProxyFiscalSenderWorker as startLegacyProxyFiscalSenderWorker } from '@/src/modules/transactions/infrastructure/fiscalization/proxySenderWorker'
import { startTransactionFiscalizationSchedulerWorker as startCanonicalTransactionFiscalizationSchedulerWorker } from '@/src/modules/transactions/infrastructure/fiscalization/transactionFiscalizationSchedulerWorker'
import { startTransactionQueueWorker as startCanonicalTransactionQueueWorker } from '@/src/modules/transactions/infrastructure/fiscalization/transactionQueueWorker'

/**
 * Canonical runtime worker service wrappers.
 *
 * These wrappers give scripts, workers, and local server entrypoints a stable
 * platform-owned import surface while the underlying queue/scheduler logic is
 * still being extracted from legacy implementations.
 */

export type RuntimeWorkerStopHandle =
  | { stop: () => void | Promise<void> }
  | (() => void | Promise<void>)
  | void

export function startAtgPollingRuntimeWorker(opts: { stationId: string }) {
  return startCanonicalAtgPollingWorker({
    ...opts,
    publishSnapshot: publishLatestTanzaniaTankInventories,
  })
}

// Compatibility alias. Prefer startAtgPollingRuntimeWorker.
export function startAtgHistoryRuntimeWorker(opts: { stationId: string }) {
  return startAtgPollingRuntimeWorker(opts)
}

export function startForecourtConfigSyncRuntimeWorker(opts?: {
  pollMs?: number
}) {
  return startLegacyForecourtConfigSyncWorker(opts)
}

export function startPssXmlSyncRuntimeWorker(opts: {
  stationId: string
  pollMs?: number
  inPath?: string
  outPath?: string
}) {
  return startLegacyPssXmlSyncWorker(opts)
}

export function startReceiptPrintRuntimeWorker(opts?: { pollMs?: number }) {
  return startLegacyPrintJobsWorker(opts)
}

export function startReportQueueRuntimeWorker(opts?: { pollMs?: number }) {
  return startLegacyReportQueueWorker(opts)
}

export function startPosCommandsRuntimeWorker(opts?: { pollMs?: number }) {
  return startCanonicalPosCommandsWorker(opts)
}

export function startSupervisorMonitorRuntimeWorker(
  stationId: string,
  opts?: { pollMs?: number },
) {
  return startCanonicalSupervisorMonitorWorker(stationId, opts)
}

export function startTransactionFiscalizationSchedulerRuntimeWorker(opts?: {
  pollMs?: number
}) {
  return startCanonicalTransactionFiscalizationSchedulerWorker(opts)
}

export function startTransactionFiscalizationRuntimeWorker(opts?: {
  pollMs?: number
}) {
  return startCanonicalTransactionQueueWorker(opts)
}

export function startOfflineReceiptPrintRuntimeWorker(opts?: {
  pollMs?: number
  batchSize?: number
}) {
  return startCanonicalOfflineReceiptPrintWorker(opts)
}

export function startProxyFiscalSenderRuntimeWorker(opts?: {
  stationId?: string
  pollMs?: number
}) {
  return startLegacyProxyFiscalSenderWorker(opts)
}

export function startEwuraRetryRuntimeWorker(opts?: {
  pollMs?: number
  batchSize?: number
}) {
  return startCanonicalEwuraRetryWorker(opts)
}

export function startInProcessRuntimeServices(
  stationId: string,
  opts?: { monitorMs?: number },
) {
  return startCanonicalInProcessRuntime(stationId, opts)
}

export function startTanzaniaDailyTotalsRuntimeWorker(opts?: {
  stationId?: string
  pollMs?: number
}) {
  return startCanonicalTanzaniaDailyTotalsWorker(opts)
}
