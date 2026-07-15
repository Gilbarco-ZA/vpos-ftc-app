import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'

import { getReplayStatusSummary } from '@/src/modules/forecourt/infrastructure/jpl/transactionService'
import { forecourtJplDynamicTankDataRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplDynamicTankDataRepo'
import { forecourtJplOptionalModulesRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplOptionalModulesRepo'
import { forecourtJplSpecialRecordsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplSpecialRecordsRepo'
import { forecourtJplWashTransactionsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplWashTransactionsRepo'

import {
  listForecourtCommandHistory,
  listForecourtPendingPriceSetsForAdmin,
  listForecourtPrices,
  listForecourtPriceScheduleEventsForAdmin,
  listForecourtTankDeliveryCheckpoints,
  listForecourtTransactions,
  listForecourtWetstockEvents,
} from '../infrastructure/adminRepo'
import { getDomsRuntimeDomainSnapshot } from './getDomsRuntimeDomainSnapshot'

export async function getJplProductionWorkflowOverview(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const limit = toPositiveInt(searchParams.get('limit'), 50, 100)
  const command = searchParams.get('command') || null
  const status = searchParams.get('status') || null
  const correlationId = searchParams.get('correlationId') || null
  const clearStatus = searchParams.get('clearStatus') || null

  const [
    commandHistory,
    deliveryCheckpoints,
    wetstockEvents,
    pendingPriceSets,
    priceScheduleEvents,
    priceRows,
    transactions,
    replayStatus,
    specialRecords,
    washTransactions,
    optionalModules,
    dynamicTankData,
    domainSnapshot,
  ] = await Promise.all([
    listForecourtCommandHistory({
      stationId: normalizedStationId,
      limit,
      command,
      status,
      correlationId,
    }),
    listForecourtTankDeliveryCheckpoints({
      stationId: normalizedStationId,
      limit,
      clearStatus,
    }),
    listForecourtWetstockEvents({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    listForecourtPendingPriceSetsForAdmin({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    listForecourtPriceScheduleEventsForAdmin({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    listForecourtPrices({ stationId: normalizedStationId }),
    listForecourtTransactions({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    getReplayStatusSummary(normalizedStationId),
    forecourtJplSpecialRecordsRepo.listWorkflow({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    forecourtJplWashTransactionsRepo.listWorkflow({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    forecourtJplOptionalModulesRepo.listWorkflow({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    forecourtJplDynamicTankDataRepo.listWorkflow({
      stationId: normalizedStationId,
      limit: Math.min(limit, 50),
    }),
    getDomsRuntimeDomainSnapshot(normalizedStationId),
  ])

  return {
    ok: true,
    stationId: normalizedStationId,
    filters: { command, status, correlationId, clearStatus, limit },
    commandHistory,
    wetstock: {
      deliveryCheckpoints,
      recentEvents: wetstockEvents,
      pendingClearCount: deliveryCheckpoints.filter(
        (row) => row.clear_status === 'pending_clear',
      ).length,
    },
    prices: {
      pendingPriceSets,
      scheduleEvents: priceScheduleEvents,
      rows: priceRows,
    },
    transactions,
    replay: replayStatus,
    specialRecords,
    washTransactions,
    optionalModules,
    dynamicTankData,
    domainSnapshot,
  }
}
