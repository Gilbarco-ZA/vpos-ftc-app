import { getForecourtAdapterDiagnostics } from '@/src/shared/forecourt/admin'

import {
  getLastForecourtEventByType,
  getLastJplReceipt,
  getNonFiscalizedTransactionCount,
  getTransactionsCreatedLastHour,
  listForecourtEventCounts,
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
  }
}
