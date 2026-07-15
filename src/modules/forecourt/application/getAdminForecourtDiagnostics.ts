import { getForecourtAdapterDiagnostics } from '@/src/shared/forecourt/admin'

import { getReplayStatusSummary } from '@/src/modules/forecourt/infrastructure/jpl/transactionService'

import {
  getLastForecourtEventByType,
  getLastJplReceipt,
  getNonFiscalizedTransactionCount,
  getTransactionsCreatedLastHour,
  listForecourtEventCounts,
  listForecourtEvents,
  listRecentForecourtEventsByPatterns,
  listTransactionStatusCounts,
} from '../infrastructure/adminRepo'
import { getForecourtConnectionStatus } from './getForecourtConnectionStatus'

export async function getAdminForecourtDiagnostics(stationId: string) {
  const { adapterState, bufferHealth } = getForecourtAdapterDiagnostics()

  const [
    connection,
    eventCounts,
    lastFpStatus,
    lastSupBufStatus,
    lastUnsupBufStatus,
    lastAnyJpl,
    txCreatedLastHour,
    txStatusCounts,
    nonFiscalized,
    replayStatus,
    recentRejects,
    recentProtocolEvents,
  ] = await Promise.all([
    getForecourtConnectionStatus(stationId),
    listForecourtEventCounts(stationId),
    getLastForecourtEventByType(stationId, ['%FpStatus%']),
    getLastForecourtEventByType(stationId, [
      '%SupTransBufStatus%',
      '%FpSupTransBufStatus%',
    ]),
    getLastForecourtEventByType(stationId, [
      '%UnSupTransBufStatus%',
      '%FpUnSupTransBufStatus%',
    ]),
    getLastJplReceipt(stationId),
    getTransactionsCreatedLastHour(stationId),
    listTransactionStatusCounts(stationId),
    getNonFiscalizedTransactionCount(stationId),
    getReplayStatusSummary(stationId),
    listRecentForecourtEventsByPatterns({
      stationId,
      source: 'jpl_tcp',
      patterns: ['RejectMessage%'],
      limit: 20,
    }),
    listForecourtEvents({
      stationId,
      source: 'jpl_tcp',
      limit: 20,
      eventType: null,
      pumpId: null,
      action: null,
    }),
  ])

  return {
    stationId,
    connection,
    adapterState,
    bufferHealth,
    lastAnyReceivedAt: lastAnyJpl?.received_at ?? null,
    eventCounts,
    lastFpStatus: lastFpStatus ?? null,
    lastSupervisedBufferStatus: lastSupBufStatus ?? null,
    lastUnsupervisedBufferStatus: lastUnsupBufStatus ?? null,
    transactions: {
      createdLastHour: txCreatedLastHour?.cnt ?? 0,
      byStatus: txStatusCounts,
      nonFiscalizedCount: nonFiscalized?.cnt ?? 0,
    },
    replay: replayStatus,
    recent: {
      rejects: recentRejects,
      protocolEvents: recentProtocolEvents,
    },
  }
}
