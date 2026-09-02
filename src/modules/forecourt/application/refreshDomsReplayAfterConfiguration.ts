import { logger } from '@/src/shared/utils/logger'

import { resetClearRejectQuarantine } from '@/src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine'
import { handleJplEvent } from '@/src/modules/forecourt/infrastructure/jpl/events'
import { invalidateJplPumpMappings } from '@/src/modules/forecourt/infrastructure/jpl/pumpMappings'
import { reconcileTransactionBuffersOnStartup } from '@/src/modules/forecourt/infrastructure/jpl/replay'

export type DomsReplayRefreshResult = {
  connected: boolean
  reconciliationAttempted: boolean
  clearedInProcessReplayKeys: number
  error?: string
}

export async function refreshDomsReplayAfterConfiguration(
  stationId: string,
): Promise<DomsReplayRefreshResult> {
  const normalizedStationId = String(stationId ?? '').trim()
  if (!normalizedStationId) throw new Error('stationId is required')

  invalidateJplPumpMappings(normalizedStationId)
  resetClearRejectQuarantine(normalizedStationId)

  let clearedInProcessReplayKeys = 0
  const seen = globalThis.__jplSeenTransactions
  if (seen) {
    for (const key of Array.from(seen)) {
      if (!String(key).startsWith(`${normalizedStationId}:`)) continue
      seen.delete(key)
      clearedInProcessReplayKeys += 1
    }
  }

  const client = globalThis.__jplTcpClient
  if (!client) {
    return {
      connected: false,
      reconciliationAttempted: false,
      clearedInProcessReplayKeys,
    }
  }

  try {
    await reconcileTransactionBuffersOnStartup({
      client,
      stationId: normalizedStationId,
      handleBufferStatusEvent: handleJplEvent,
    })
    return {
      connected: true,
      reconciliationAttempted: true,
      clearedInProcessReplayKeys,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      '[jplTcp] post-configuration transaction reconciliation failed',
      {
        stationId: normalizedStationId,
        error: message,
      },
    )
    return {
      connected: true,
      reconciliationAttempted: true,
      clearedInProcessReplayKeys,
      error: message,
    }
  }
}
