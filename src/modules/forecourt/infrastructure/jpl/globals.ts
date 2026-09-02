import type { PumpMappingsCache } from '@/src/modules/forecourt/infrastructure/jpl/types'
import type { JplClient } from '@gilbarcoafs/doms-pos-jpl'

declare global {
  var __jplTcpAdapterStarted: boolean | undefined
  var __jplTcpStartPromise: Promise<void> | undefined
  var __jplTcpTeardownPromise: Promise<void> | undefined
  var __jplTcpShuttingDown: boolean | undefined
  var __jplProcessHandlersAttached: boolean | undefined
  var __jplTcpClient: JplClient | undefined
  var __jplPumpMappingsCache: PumpMappingsCache | undefined
  var __jplSeenTransactions: Set<string> | undefined
  var __jplTcpProtocolDisposers: Array<() => void> | undefined
  var __jplTcpReconnectTimer: NodeJS.Timeout | undefined
  var __jplTcpHeartbeatTimer: NodeJS.Timeout | undefined
  var __jplTcpHealthTimer: NodeJS.Timeout | undefined
  var __jplTcpFallbackPollTimer: NodeJS.Timeout | undefined
  var __jplTcpFallbackPollInFlight: boolean | undefined
  var __jplTcpFallbackBufferCursor: number | undefined
  var __jplTransactionBufferPreferredSubCode:
    | { supervised?: string; unsupervised?: string }
    | undefined
  var __jplTcpAcceptedAccessCode: string | undefined
  var __jplPosSessionOwnerId: string | undefined
  var __jplPosSessionHeartbeatTimer: NodeJS.Timeout | undefined
  var __jplPersistDedupe: Map<string, number> | undefined
  var __jplReplayLocks: Map<string, Promise<void>> | undefined
  var __jplInFlightReplayKeys: Set<string> | undefined
  var __jplServiceDrainInFlight: Promise<any> | undefined
  var __jplBorDrainInFlight: Promise<any> | undefined
  var __jplTxRecoveryInFlightByStation: Map<string, Promise<any>> | undefined
  var __jplClearRejectQuarantine:
    | Map<
        string,
        {
          stationId: string
          sourceMode: 'supervised' | 'unsupervised'
          fpId: number
          transSeqNo: number
          rejectCode: string
          rejectInfo: string
          rejectInfoText: string
          rejectedExtendedMsgCode: string
          rejectedMsgSubc: string
          correlationId: string | null
          quarantinedAt: number
        }
      >
    | undefined
  var __jplReplayCapabilities:
    | {
        supervised: 'unknown' | 'allowed' | 'denied'
        unsupervised: 'unknown' | 'allowed' | 'denied'
      }
    | undefined
}

export {}
