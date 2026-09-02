import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'
import type { TransactionCheckpointRow } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionCheckpointRepo'

import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { serializeError } from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import {
  markBufferCleared,
  markBufferError,
} from '@/src/modules/forecourt/infrastructure/jpl/bufferHealth'
import {
  quarantineDeterministicSupervisedClearReject,
  resetClearRejectQuarantine,
} from '@/src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine'
import {
  beginReplayKey,
  endReplayKey,
  withReplayLock,
} from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import { runSingleFlight } from '@/src/modules/forecourt/infrastructure/jpl/singleFlight'
import {
  requestTransactionBufferStatusWithFallback,
  transactionBufferContains,
  verifyTransactionAbsentFromBuffer,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionBufferStatus'
import {
  buildTransactionPumpLockKey,
  buildTransactionReplayKey,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'
import {
  buildClearSupervisedTransactionRequest,
  buildClearUnsupervisedTransactionRequest,
  extractExtendedClearFields,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'
import { forecourtJplReplayRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplReplayRepo'
import { forecourtJplTransactionCheckpointRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionCheckpointRepo'
import { forecourtJplTransactionRecoveryRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionRecoveryRepo'
import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export type JplTransactionRecoverySweepInput = {
  stationId: string
  client?: any
  requestedBy?: string | null
  triggerSource?: 'startup' | 'manual_admin' | 'diagnostic_api'
  dryRun?: boolean
  limit?: number
  maxClearAttempts?: number
  staleForeignLockSeconds?: number
}

export type JplTransactionRecoveryAction = {
  sourceMode: BufferMode
  fpId: number
  transSeqNo: number
  lifecycleStage: string
  action:
    | 'retry_clear'
    | 'skipped_no_clear_payload'
    | 'skipped_dry_run'
    | 'skipped_in_flight'
    | 'blocked_foreign_lock'
    | 'clear_succeeded'
    | 'clear_failed'
  lockId?: string | null
  ownerPosId?: string | null
  error?: string | null
}

export type JplTransactionRecoverySweepResult = {
  runId: string
  stationId: string
  dryRun: boolean
  status: 'completed' | 'completed_with_errors' | 'failed'
  rowsScanned: number
  retriesAttempted: number
  clearSuccessCount: number
  blockedCount: number
  failedCount: number
  actions: JplTransactionRecoveryAction[]
}

const toErrorText = (error: unknown): string => {
  const serialized = serializeError(error)
  if (serialized == null) return 'Unknown DOMS/JPL recovery error'
  return typeof serialized === 'string'
    ? serialized
    : JSON.stringify(serialized)
}

const toId2 = (value: unknown) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '00'
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0')
}

const toDec4 = (value: unknown) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0000'
  return String(Math.max(0, Math.trunc(n))).padStart(4, '0')
}

const unwrapClearPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null
  return payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload
}

const hasClearField = (payload: any): boolean => {
  const candidate = unwrapClearPayload(payload)
  if (!candidate) return false
  const extended = extractExtendedClearFields(candidate)
  return Boolean(
    extended.Money ||
    extended.Money_e ||
    extended.Vol_e ||
    candidate.PaymentParameters ||
    candidate.paymentParameters ||
    candidate.EptReceiptFormatId ||
    candidate.eptReceiptFormatId ||
    candidate.EptReceiptItems ||
    candidate.eptReceiptItems,
  )
}

const resolveClearPayload = (row: TransactionCheckpointRow) => {
  if (hasClearField(row.clear_payload_json)) {
    return unwrapClearPayload(row.clear_payload_json)
  }
  if (hasClearField(row.read_payload_json)) {
    return unwrapClearPayload(row.read_payload_json)
  }
  const transPars =
    row.read_payload_json?.TransPars ?? row.read_payload_json?.transPars
  if (hasClearField(transPars)) return unwrapClearPayload(transPars)
  return null
}

const buildClearRequestForRow = (
  row: TransactionCheckpointRow,
  posId: string,
) => {
  const fpId = toId2(row.fp_id)
  const transSeqNo = toDec4(row.trans_seq_no)
  const payload = resolveClearPayload(row)
  if (!payload) return null

  if (row.source_mode === 'supervised') {
    return buildClearSupervisedTransactionRequest({
      fpId,
      posId,
      transSeqNo,
      txData: payload,
      payload: payload && typeof payload === 'object' ? payload : {},
    })
  }

  return buildClearUnsupervisedTransactionRequest({
    fpId,
    posId,
    transSeqNo,
    txData: payload,
    payload: payload && typeof payload === 'object' ? payload : {},
  })
}

const completeCheckpointAsCleared = async (args: {
  row: TransactionCheckpointRow
  posId: string
}) => {
  await forecourtJplReplayRepo.markTransactionCleared({
    stationId: args.row.station_id,
    sourceMode: args.row.source_mode,
    fpId: Number(args.row.fp_id),
    transSeqNo: Number(args.row.trans_seq_no),
  })

  if (args.row.source_mode === 'supervised') {
    await forecourtJplReplayRepo.upsert({
      stationId: args.row.station_id,
      fpId: Number(args.row.fp_id),
      transSeqNo: Number(args.row.trans_seq_no),
      replayStage: 'cleared',
      clearedAt: new Date().toISOString(),
      lastError: null,
    })
  }

  await forecourtJplTransactionCheckpointRepo.upsert({
    stationId: args.row.station_id,
    sourceMode: args.row.source_mode,
    fpId: Number(args.row.fp_id),
    transSeqNo: Number(args.row.trans_seq_no),
    lifecycleStage: 'cleared',
    lockId: args.row.lock_id ?? args.posId,
    ownerPosId: args.posId,
    blockedByForeignPos: false,
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
  })

  markBufferCleared(
    args.row.source_mode,
    Number(args.row.fp_id),
    Number(args.row.trans_seq_no),
  )
}

const recordClearFailure = async (args: {
  row: TransactionCheckpointRow
  posId: string
  error: unknown
}) => {
  markBufferError(args.row.source_mode, Number(args.row.fp_id), args.error)
  await forecourtJplTransactionCheckpointRepo.upsert({
    stationId: args.row.station_id,
    sourceMode: args.row.source_mode,
    fpId: Number(args.row.fp_id),
    transSeqNo: Number(args.row.trans_seq_no),
    lifecycleStage: 'failed',
    lockId: args.row.lock_id ?? null,
    ownerPosId: args.posId,
    blockedByForeignPos: false,
    lastAttemptAt: new Date().toISOString(),
    lastError: toErrorText(args.error),
  })
}

export const runJplTransactionRecoverySweep = async (
  input: JplTransactionRecoverySweepInput,
): Promise<JplTransactionRecoverySweepResult> => {
  const stationId = String(input.stationId ?? '').trim()
  if (!stationId) throw new Error('stationId is required')

  if (!globalThis.__jplTxRecoveryInFlightByStation) {
    globalThis.__jplTxRecoveryInFlightByStation = new Map()
  }

  return await runSingleFlight({
    registry: globalThis.__jplTxRecoveryInFlightByStation,
    key: stationId,
    run: async () => {
      const cfg = getForecourtRuntimeConfig()
      const posId = String(cfg.jplPosId ?? '01').padStart(2, '0')
      const dryRun = input.dryRun === true
      const runId = uuidv4()
      const actions: JplTransactionRecoveryAction[] = []
      const resetQuarantineCount =
        !dryRun && (input.triggerSource ?? 'manual_admin') === 'manual_admin'
          ? resetClearRejectQuarantine(stationId)
          : 0

      await forecourtJplTransactionRecoveryRepo.createRun({
        id: runId,
        stationId,
        requestedBy: input.requestedBy ?? null,
        triggerSource: input.triggerSource ?? 'manual_admin',
        detailsJson: {
          dryRun,
          maxClearAttempts: input.maxClearAttempts ?? 5,
          limit: input.limit ?? 50,
          resetQuarantineCount,
        },
      })

      let rowsScanned = 0
      let retriesAttempted = 0
      let clearSuccessCount = 0
      let blockedCount = 0
      let failedCount = 0
      let lastError: string | null = null

      try {
        const [recoverableRows, staleLocks] = await Promise.all([
          forecourtJplTransactionCheckpointRepo.listRecoverableByStation({
            stationId,
            maxClearAttempts: input.maxClearAttempts ?? 5,
            limit: input.limit ?? 50,
          }),
          forecourtJplTransactionCheckpointRepo.listStaleForeignLocksByStation({
            stationId,
            staleAfterSeconds: input.staleForeignLockSeconds ?? 900,
            limit: 50,
          }),
        ])

        rowsScanned = recoverableRows.length + staleLocks.length

        for (const row of staleLocks) {
          blockedCount += 1
          actions.push({
            sourceMode: row.source_mode,
            fpId: Number(row.fp_id),
            transSeqNo: Number(row.trans_seq_no),
            lifecycleStage: row.lifecycle_stage,
            action: 'blocked_foreign_lock',
            lockId: row.lock_id,
            ownerPosId: row.owner_pos_id,
            error:
              'Transaction is locked by another POS. Automatic ID_ZERO release remains disabled; field/operator action is required.',
          })
        }

        if (!dryRun && !input.client) {
          throw new Error(
            'JPL TCP adapter is not connected; recovery clear cannot run',
          )
        }

        for (const row of recoverableRows) {
          const fpId = Number(row.fp_id)
          const transSeqNo = Number(row.trans_seq_no)

          if (!Number.isFinite(fpId) || !Number.isFinite(transSeqNo)) continue

          const key = buildTransactionReplayKey({
            stationId,
            sourceMode: row.source_mode,
            fpId,
            transSeqNo,
          })
          const lockKey = buildTransactionPumpLockKey({
            stationId,
            sourceMode: row.source_mode,
            fpId,
          })

          const request = buildClearRequestForRow(row, posId)
          if (!request) {
            actions.push({
              sourceMode: row.source_mode,
              fpId,
              transSeqNo,
              lifecycleStage: row.lifecycle_stage,
              action: 'skipped_no_clear_payload',
              lockId: row.lock_id,
              ownerPosId: row.owner_pos_id,
              error:
                'No durable read/clear payload is available. Re-poll the DOMS transaction buffer before attempting clear recovery.',
            })
            continue
          }

          if (dryRun) {
            actions.push({
              sourceMode: row.source_mode,
              fpId,
              transSeqNo,
              lifecycleStage: row.lifecycle_stage,
              action: 'skipped_dry_run',
              lockId: row.lock_id,
              ownerPosId: row.owner_pos_id,
            })
            continue
          }

          if (!beginReplayKey(key)) {
            actions.push({
              sourceMode: row.source_mode,
              fpId,
              transSeqNo,
              lifecycleStage: row.lifecycle_stage,
              action: 'skipped_in_flight',
              lockId: row.lock_id,
              ownerPosId: row.owner_pos_id,
            })
            continue
          }

          try {
            await withReplayLock(lockKey, async () => {
              const fpId2 = toId2(fpId)
              const seq4 = toDec4(transSeqNo)
              const beforeClear =
                await requestTransactionBufferStatusWithFallback({
                  client: input.client,
                  sourceMode: row.source_mode,
                  fpId: fpId2,
                })

              if (
                !transactionBufferContains({
                  sourceMode: row.source_mode,
                  response: beforeClear.response,
                  transSeqNo: seq4,
                })
              ) {
                await completeCheckpointAsCleared({ row, posId })
                clearSuccessCount += 1
                globalThis.__jplSeenTransactions?.add(key)
                actions.push({
                  sourceMode: row.source_mode,
                  fpId,
                  transSeqNo,
                  lifecycleStage: 'cleared',
                  action: 'clear_succeeded',
                  lockId: row.lock_id,
                  ownerPosId: posId,
                  error: 'DOMS buffer already confirmed transaction absent.',
                })
                return
              }

              retriesAttempted += 1
              await forecourtJplTransactionCheckpointRepo.upsert({
                stationId,
                sourceMode: row.source_mode,
                fpId,
                transSeqNo,
                lifecycleStage: 'clear_requested',
                lockId: row.lock_id ?? posId,
                ownerPosId: posId,
                blockedByForeignPos: false,
                clearAttemptsIncrement: 1,
                lastAttemptAt: new Date().toISOString(),
                clearPayloadJson: request.data,
                lastError: null,
              })

              await input.client.request(request)
              await verifyTransactionAbsentFromBuffer({
                client: input.client,
                sourceMode: row.source_mode,
                fpId: fpId2,
                transSeqNo: seq4,
              })
              await completeCheckpointAsCleared({ row, posId })
              clearSuccessCount += 1
              globalThis.__jplSeenTransactions?.add(key)
              actions.push({
                sourceMode: row.source_mode,
                fpId,
                transSeqNo,
                lifecycleStage: 'cleared',
                action: 'clear_succeeded',
                lockId: row.lock_id,
                ownerPosId: posId,
              })
            })
          } catch (error) {
            failedCount += 1
            lastError = toErrorText(error)
            if (row.source_mode === 'supervised') {
              quarantineDeterministicSupervisedClearReject({
                stationId,
                fpId,
                transSeqNo,
                error,
              })
            }
            await recordClearFailure({ row, posId, error })
            actions.push({
              sourceMode: row.source_mode,
              fpId,
              transSeqNo,
              lifecycleStage: 'failed',
              action: 'clear_failed',
              lockId: row.lock_id,
              ownerPosId: posId,
              error: lastError,
            })
            logger.error('[jplTcp] transaction recovery clear failed', {
              stationId,
              sourceMode: row.source_mode,
              fpId,
              transSeqNo,
              error: serializeError(error),
            })
          } finally {
            endReplayKey(key)
          }
        }

        const status = failedCount > 0 ? 'completed_with_errors' : 'completed'
        await forecourtJplTransactionRecoveryRepo.completeRun({
          id: runId,
          status,
          rowsScanned,
          retriesAttempted,
          clearSuccessCount,
          blockedCount,
          failedCount,
          detailsJson: { actions },
          lastError,
        })

        return {
          runId,
          stationId,
          dryRun,
          status,
          rowsScanned,
          retriesAttempted,
          clearSuccessCount,
          blockedCount,
          failedCount,
          actions,
        }
      } catch (error) {
        failedCount += 1
        lastError = toErrorText(error)
        await forecourtJplTransactionRecoveryRepo.completeRun({
          id: runId,
          status: 'failed',
          rowsScanned,
          retriesAttempted,
          clearSuccessCount,
          blockedCount,
          failedCount,
          detailsJson: { actions },
          lastError,
        })
        throw error
      }
    },
  })
}
