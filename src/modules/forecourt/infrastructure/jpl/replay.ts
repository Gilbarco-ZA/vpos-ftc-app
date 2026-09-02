import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type {
  JplReplayEntry,
  NormalizedTransactionResult,
  ReplayRejectKind,
  SupervisedReplayStage,
} from '@/src/modules/forecourt/infrastructure/jpl/types'

import { getPostgresPoolDiagnostics } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'
import { shortenUUID } from '@/src/shared/utils/shortenUUID'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  getSupervisedTxClearFields,
  resolveTransSeqNo,
  serializeError,
  toJplDecimalString,
} from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import {
  markBufferCleared,
  markBufferError,
  markBufferRead,
} from '@/src/modules/forecourt/infrastructure/jpl/bufferHealth'
import {
  getClearRejectQuarantineEntry,
  quarantineDeterministicSupervisedClearReject,
} from '@/src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine'
import { getJplPumpMappings } from '@/src/modules/forecourt/infrastructure/jpl/pumpMappings'
import {
  beginReplayKey,
  canAttemptReplay,
  endReplayKey,
  markReplayCapability,
  withReplayLock,
} from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import {
  requestTransactionBufferStatusWithFallback,
  verifyTransactionAbsentFromBuffer,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionBufferStatus'
import {
  buildTransactionPumpLockKey,
  buildTransactionReplayKey,
  classifyTransactionLockOwnership,
  resolveTransactionReplayAction,
  shouldSuppressRecentlyClearedOwnedReplay,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'
import {
  buildClearSupervisedTransactionRequest,
  buildClearUnsupervisedTransactionRequest,
  buildReadUnsupervisedTransactionRequest,
  buildUnlockUnsupervisedTransactionRequest,
  DEFAULT_TRANSACTION_PAR_IDS,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'
import {
  buildUnattendedClearPayload,
  extractJplUnattendedReceiptCapture,
  redactJplSensitivePaymentData,
} from '@/src/modules/forecourt/infrastructure/jpl/unattendedTransactions'
import { forecourtJplReplayRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplReplayRepo'
import { forecourtJplTransactionCheckpointRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionCheckpointRepo'
import { forecourtJplTransactionsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionsRepo'
import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'
import { getStationLinkingWindowSecondsSafe } from '@/src/modules/transactions/infrastructure/linkingWindow'

export type HandleNormalizedTransactionsFn = (
  stationId: string,
  mappings: Map<number, any>,
  transactions: any[],
) => Promise<NormalizedTransactionResult[]>

const transParId = [...DEFAULT_TRANSACTION_PAR_IDS]

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })

const boundedEnvInt = (
  name: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

const pauseStartupReconciliation = async () => {
  const baseGapMs = boundedEnvInt(
    'VPOS_JPL_STARTUP_RECONCILIATION_GAP_MS',
    40,
    0,
    500,
  )
  const pool = getPostgresPoolDiagnostics()
  const pressureGapMs =
    pool.waitingCount > 0 ||
    (pool.totalCount >= pool.max && pool.idleCount === 0)
      ? Math.min(750, 100 + pool.waitingCount * 25)
      : 0
  const gapMs = Math.max(baseGapMs, pressureGapMs)
  if (gapMs > 0) await delay(gapMs)
}

export const normalizeLockId = (value: unknown): string | null => {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  return s.padStart(2, '0')
}

const getRejectData = (err: unknown): Record<string, any> | null => {
  const anyErr = err as any
  return (
    anyErr?.details?.raw?.data ??
    anyErr?.rejectMessage?.data ??
    anyErr?.data ??
    anyErr?.response?.data ??
    anyErr?.cause?.data ??
    null
  )
}

export const isAccessReject = (err: unknown) => {
  const data = getRejectData(err)
  const rejectCode = String(
    data?.RejectCode?.value ?? data?.rejectCode?.value ?? '',
  ).toUpperCase()

  // DPP RejectCode 03H means the request cannot currently be processed.
  // It is a state/access error for this attempt, not evidence that the whole
  // transaction-buffer family is permanently unavailable for this process.
  return rejectCode === '03H'
}

const getRejectInfoText = (err: unknown): string => {
  const data = getRejectData(err)
  return String(data?.RejectInfoText ?? data?.rejectInfoText ?? '')
}

const getRejectedExtendedMsgCode = (err: unknown): string => {
  const data = getRejectData(err)
  return String(
    data?.RejectedExtendedMsgCode ?? data?.rejectedExtendedMsgCode ?? '',
  ).toUpperCase()
}

export const isTransactionNotFoundReject = (err: unknown): boolean => {
  const infoText = getRejectInfoText(err).trim().toLowerCase()
  const data = getRejectData(err)
  const rejectInfo = String(
    data?.RejectInfo?.value ??
      data?.RejectInfo ??
      data?.rejectInfo?.value ??
      data?.rejectInfo ??
      '',
  ).toUpperCase()
  const extCode = getRejectedExtendedMsgCode(err)

  return (
    infoText.includes('trans not found') ||
    (extCode === '0030H' && rejectInfo === '08H')
  )
}

export const classifyReplayReject = (err: unknown): ReplayRejectKind => {
  const data = getRejectData(err)
  const rejectCode = String(
    data?.RejectCode?.value ?? data?.rejectCode?.value ?? '',
  ).toUpperCase()
  const infoText = getRejectInfoText(err).toLowerCase()
  const extCode = getRejectedExtendedMsgCode(err)

  if (rejectCode !== '03H') return 'other'
  if (
    infoText.includes('allready locked') ||
    infoText.includes('already locked')
  ) {
    return 'already_locked'
  }
  if (extCode === '002EH') {
    return 'access_denied'
  }
  return 'access_denied'
}

const resolveClearSeqNo = (args: {
  fallbackSeqNo: number
  txData?: any | null
  replayRow?: any | null
}) => {
  const fromTx = resolveTransSeqNo(args.txData)
  if (fromTx != null && Number.isFinite(fromTx)) {
    return String(fromTx).padStart(4, '0')
  }

  const fromReplay = resolveTransSeqNo(args.replayRow?.read_payload_json)
  if (fromReplay != null && Number.isFinite(fromReplay)) {
    return String(fromReplay).padStart(4, '0')
  }

  return String(args.fallbackSeqNo).padStart(4, '0')
}

async function upsertTransactionFromNormalized(
  stationId: string,
  tx: {
    fpId: string
    transSeqNo: string
    isSupported: boolean
    volume: number | null
    moneyDue: number | null
    unattendedCapture?: ReturnType<typeof extractJplUnattendedReceiptCapture>
    payloadJson?: Record<string, unknown>
  },
): Promise<void> {
  if (tx.moneyDue == null && tx.volume == null) return

  const linkingWindowSeconds =
    await getStationLinkingWindowSecondsSafe(stationId)
  const newId = uuidv4()
  const posReference = shortenUUID(newId)

  const pumpNumber = Number(tx.fpId)
  if (!Number.isFinite(pumpNumber) || pumpNumber <= 0) return

  await forecourtJplTransactionsRepo.upsertNormalizedBufferTransaction({
    id: newId,
    stationId,
    pumpNumber,
    totalAmount: tx.moneyDue,
    volume: tx.volume,
    posReference,
    linkingWindowSeconds: linkingWindowSeconds ?? 0,
    sourceMode: tx.isSupported ? 'supervised' : 'unsupervised',
    fpId: pumpNumber,
    transSeqNo: Number(tx.transSeqNo),
    payloadJson: tx.payloadJson ?? {
      fpId: tx.fpId,
      transSeqNo: tx.transSeqNo,
      isSupported: tx.isSupported,
      volume: tx.volume,
      moneyDue: tx.moneyDue,
    },
    externalPaymentReference:
      tx.unattendedCapture?.externalPaymentReference ?? null,
    eptId: tx.unattendedCapture?.eptId ?? null,
    eptSeqNo: tx.unattendedCapture?.eptSeqNo ?? null,
    eptReceiptFormatId: tx.unattendedCapture?.eptReceiptFormatId ?? null,
    receiptNo: tx.unattendedCapture?.receiptNo ?? null,
    cardLabel: tx.unattendedCapture?.cardLabel ?? null,
    cardPanMasked: tx.unattendedCapture?.cardPanMasked ?? null,
  })
}

const checkpointErrorText = (err: unknown) => {
  const serialized = serializeError(err)
  if (serialized == null) return null
  return typeof serialized === 'string'
    ? serialized
    : JSON.stringify(serialized)
}

export const pullAndClearSupervisedTransactions = async (args: {
  stationId: string
  bufferEntries: JplReplayEntry[]
  handleNormalizedTransactions: HandleNormalizedTransactionsFn
}) => {
  const { bufferEntries, stationId, handleNormalizedTransactions } = args
  const cfg = getForecourtRuntimeConfig()
  const client = globalThis.__jplTcpClient
  if (!client) return

  const currentPosId = String(cfg.jplPosId ?? '01').padStart(2, '0')

  for (const entry of bufferEntries) {
    const fpId = Number(entry.fpId)
    const transSeqNo = Number(entry.transSeqNo)
    if (!Number.isFinite(fpId) || !Number.isFinite(transSeqNo)) continue

    const lockId = normalizeLockId(entry.transLockId)
    const fpId2 = String(fpId).padStart(2, '0')
    const seq4 = String(transSeqNo).padStart(4, '0')
    const seenKey = buildTransactionReplayKey({
      stationId,
      sourceMode: 'supervised',
      fpId,
      transSeqNo,
    })
    const inFlightKey = seenKey
    const pumpLockKey = buildTransactionPumpLockKey({
      stationId,
      sourceMode: 'supervised',
      fpId,
    })

    if (!beginReplayKey(inFlightKey)) continue

    let previousReplayStage: SupervisedReplayStage | null = null
    let previousClearedAt: string | null = null

    try {
      await withReplayLock(pumpLockKey, async () => {
        const lockOwnership = classifyTransactionLockOwnership({
          lockId,
          currentPosId,
        })

        if (lockOwnership !== 'foreign') {
          const quarantined = getClearRejectQuarantineEntry({
            stationId,
            sourceMode: 'supervised',
            fpId,
            transSeqNo,
          })
          if (quarantined) return
        }

        const replayRow =
          lockOwnership === 'foreign'
            ? null
            : await forecourtJplReplayRepo.getByKey({
                stationId,
                fpId,
                transSeqNo,
              })
        previousReplayStage = replayRow?.replay_stage ?? null
        previousClearedAt = replayRow?.cleared_at ?? null

        if (
          shouldSuppressRecentlyClearedOwnedReplay({
            lockId,
            currentPosId,
            replayStage: previousReplayStage,
            clearedAt: previousClearedAt,
            graceMs: boundedEnvInt(
              'VPOS_JPL_RECENT_CLEAR_STALE_GRACE_MS',
              30_000,
              1_000,
              120_000,
            ),
          })
        ) {
          markBufferCleared('supervised', fpId, transSeqNo)
          logger.info('[jplTcp]', {
            msg: 'ignoring recently cleared supervised transaction from stale DOMS buffer snapshot',
            stationId,
            fpId,
            transSeqNo: seq4,
            lockId,
            clearedAt: previousClearedAt,
          })
          return
        }

        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'supervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'discovered',
          lockId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          lastAttemptAt: new Date().toISOString(),
          lastError: null,
        })

        if (lockOwnership === 'foreign') {
          logger.warn('[jplTcp]', {
            msg: 'supervised tx locked by another POS; skipping',
            fpId,
            transSeqNo: seq4,
            lockId,
            currentPosId,
          })
          await forecourtJplTransactionCheckpointRepo.upsert({
            stationId,
            sourceMode: 'supervised',
            fpId,
            transSeqNo,
            lifecycleStage: 'blocked_by_foreign_pos',
            lockId,
            ownerPosId: currentPosId,
            blockedByForeignPos: true,
            lastAttemptAt: new Date().toISOString(),
            lastError: `Locked by POS ${lockId}`,
          })
          return
        }

        markBufferRead('supervised', fpId, transSeqNo)

        let txData: any | null = null
        let clearFields: { Vol_e: string; Money_e: string } | null = null

        if (lockOwnership === 'owned') {
          // A DEC4 TransSeqNo can be reused after controller reset/rollover.
          // Never clear from cached payload solely because this POS owns the
          // same FP/sequence key; unlock and re-read the transaction currently
          // present in DOMS so capture/identity/mapping use live values.
          logger.info('[jplTcp]', {
            msg: 'supervised tx locked by this POS; re-reading current DOMS transaction before capture/clear',
            fpId,
            transSeqNo: seq4,
            currentPosId,
            previousReplayStage: replayRow?.replay_stage ?? null,
          })

          await (client as any).request({
            name: 'unlock_FpSupTrans_req',
            subCode: '00H',
            data: { FpId: fpId2, PosId: currentPosId, TransSeqNo: seq4 },
          })

          const tx = await (client as any).request({
            name: 'FpSupTrans_req',
            subCode: '00H',
            data: {
              FpId: fpId2,
              TransSeqNo: seq4,
              PosId: currentPosId,
              TransParId: transParId,
            },
          })

          txData = tx?.data ?? {}
          clearFields = getSupervisedTxClearFields(txData)

          await forecourtJplTransactionCheckpointRepo.upsert({
            stationId,
            sourceMode: 'supervised',
            fpId,
            transSeqNo,
            lifecycleStage: 'read_locked',
            lockId: currentPosId,
            ownerPosId: currentPosId,
            blockedByForeignPos: false,
            readAttemptsIncrement: 1,
            lastAttemptAt: new Date().toISOString(),
            readPayloadJson: txData,
            clearPayloadJson: clearFields,
            lastError: null,
          })
          await forecourtJplReplayRepo.upsert({
            stationId,
            fpId,
            transSeqNo,
            replayStage: 'read_locked',
            lockId: currentPosId,
            lastError: null,
          })
        } else {
          const tx = await (client as any).request({
            name: 'FpSupTrans_req',
            subCode: '00H',
            data: {
              FpId: fpId2,
              TransSeqNo: seq4,
              PosId: currentPosId,
              TransParId: transParId,
            },
          })

          txData = tx?.data ?? {}
          clearFields = getSupervisedTxClearFields(txData)

          await forecourtJplTransactionCheckpointRepo.upsert({
            stationId,
            sourceMode: 'supervised',
            fpId,
            transSeqNo,
            lifecycleStage: 'read_locked',
            lockId: currentPosId,
            ownerPosId: currentPosId,
            blockedByForeignPos: false,
            readAttemptsIncrement: 1,
            lastAttemptAt: new Date().toISOString(),
            readPayloadJson: txData,
            clearPayloadJson: clearFields,
            lastError: null,
          })
          await forecourtJplReplayRepo.upsert({
            stationId,
            fpId,
            transSeqNo,
            replayStage: 'read_locked',
            lockId: currentPosId,
            lastError: null,
          })
        }

        if (!clearFields) {
          throw new Error(
            `Missing supervised clear fields (fp=${fpId}, seq=${seq4})`,
          )
        }

        if (txData) {
          const tp: any = txData?.TransPars ?? {}
          const moneyForNormalize = toJplDecimalString(
            tp?.Money_e ??
              txData?.Money_e ??
              tp?.Money ??
              tp?.MoneyDue ??
              txData?.Money ??
              txData?.MoneyDue,
          )
          const volForNormalize = toJplDecimalString(
            tp?.Vol_e ??
              txData?.Vol_e ??
              tp?.Vol ??
              tp?.Volume ??
              txData?.Vol ??
              txData?.Volume,
          )

          const mappings = await getJplPumpMappings(stationId)
          const processed = await handleNormalizedTransactions(
            stationId,
            mappings,
            [
              {
                ...txData,
                sourceMode: 'supervised',
                isSupervised: true,
                raw: {
                  ...txData,
                  sourceMode: 'supervised',
                  isSupervised: true,
                  TransLockId: currentPosId,
                  MoneyDue: moneyForNormalize,
                  Vol: volForNormalize,
                },
                fpId,
                transSeqNo,
                transLockId: currentPosId,
              },
            ],
          )

          const captured = processed.some(
            (item) =>
              item.sourceMode === 'supervised' &&
              Number(item.domsFpId) === fpId &&
              item.transSeqNo === transSeqNo &&
              item.persisted,
          )

          if (!captured) {
            throw new Error(
              `Refusing to clear supervised transaction before durable capture (fp=${fpId}, seq=${seq4})`,
            )
          }

          await forecourtJplReplayRepo.markTransactionCaptured({
            stationId,
            sourceMode: 'supervised',
            fpId,
            transSeqNo,
            transLockId: currentPosId,
          })

          await forecourtJplReplayRepo.upsert({
            stationId,
            fpId,
            transSeqNo,
            replayStage: 'captured',
            capturedAt: new Date().toISOString(),
            lastError: null,
          })
          await forecourtJplTransactionCheckpointRepo.upsert({
            stationId,
            sourceMode: 'supervised',
            fpId,
            transSeqNo,
            lifecycleStage: 'captured',
            lockId: currentPosId,
            ownerPosId: currentPosId,
            blockedByForeignPos: false,
            lastSuccessAt: new Date().toISOString(),
            lastError: null,
          })
        }

        const clearSeqNo = resolveClearSeqNo({
          fallbackSeqNo: transSeqNo,
          txData,
          replayRow,
        })

        const clearRequest = buildClearSupervisedTransactionRequest({
          fpId: fpId2,
          posId: currentPosId,
          transSeqNo: clearSeqNo,
          txData: txData ?? replayRow?.read_payload_json ?? clearFields,
          payload: clearFields,
        })

        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'supervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'clear_requested',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          clearAttemptsIncrement: 1,
          lastAttemptAt: new Date().toISOString(),
          clearPayloadJson: clearRequest.data,
          lastError: null,
        })

        await (client as any).request(clearRequest)
        await verifyTransactionAbsentFromBuffer({
          client,
          sourceMode: 'supervised',
          fpId: fpId2,
          transSeqNo: clearSeqNo,
        })

        markBufferCleared('supervised', fpId, transSeqNo)

        await forecourtJplReplayRepo.markTransactionCleared({
          stationId,
          sourceMode: 'supervised',
          fpId,
          transSeqNo,
        })
        await forecourtJplReplayRepo.upsert({
          stationId,
          fpId,
          transSeqNo,
          replayStage: 'cleared',
          lockId: currentPosId,
          clearedAt: new Date().toISOString(),
          lastError: null,
        })
        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'supervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'cleared',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          lastSuccessAt: new Date().toISOString(),
          lastError: null,
        })
      })
    } catch (err) {
      if (
        previousReplayStage === 'cleared' &&
        isTransactionNotFoundReject(err)
      ) {
        markBufferCleared('supervised', fpId, transSeqNo)
        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'supervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'cleared',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          lastSuccessAt: previousClearedAt ?? new Date().toISOString(),
          lastError: null,
        })
        logger.info('[jplTcp]', {
          msg: 'DOMS confirmed previously cleared supervised transaction is absent; stale buffer snapshot ignored',
          stationId,
          fpId,
          transSeqNo: seq4,
          clearedAt: previousClearedAt,
        })
        continue
      }

      const kind = classifyReplayReject(err)
      if (kind === 'access_denied') {
        markReplayCapability('supervised', 'unknown')
      }
      const quarantined = quarantineDeterministicSupervisedClearReject({
        stationId,
        fpId,
        transSeqNo,
        error: err,
      })
      markBufferError('supervised', fpId, err)
      await forecourtJplTransactionCheckpointRepo.upsert({
        stationId,
        sourceMode: 'supervised',
        fpId,
        transSeqNo,
        lifecycleStage: 'failed',
        lockId,
        ownerPosId: currentPosId,
        blockedByForeignPos: false,
        lastAttemptAt: new Date().toISOString(),
        lastError: checkpointErrorText(err),
      })
      logger.error('[jplTcp]', {
        msg: `supervised pull/clear failed fpId=${fpId} seq=${transSeqNo}`,
        replayReject: kind,
        clearRetryQuarantined: Boolean(quarantined),
        error: serializeError(err),
      })
    } finally {
      endReplayKey(inFlightKey)
    }
  }
}

export const pullAndClearUnsupervisedTransactions = async (args: {
  stationId: string
  bufferEntries: JplReplayEntry[]
  handleNormalizedTransactions: HandleNormalizedTransactionsFn
}) => {
  const { bufferEntries, stationId, handleNormalizedTransactions } = args
  const client = globalThis.__jplTcpClient
  if (!client) return

  const cfg = getForecourtRuntimeConfig()
  const currentPosId = String(cfg.jplPosId ?? '01').padStart(2, '0')

  for (const entry of bufferEntries) {
    const fpId = Number(entry.fpId)
    const transSeqNo = Number(entry.transSeqNo)
    if (!Number.isFinite(fpId) || !Number.isFinite(transSeqNo)) continue

    const lockId = normalizeLockId(entry.transLockId)
    const lockOwnership = classifyTransactionLockOwnership({
      lockId,
      currentPosId,
    })
    const fpId2 = String(fpId).padStart(2, '0')
    const seq4 = String(transSeqNo).padStart(4, '0')
    const key = buildTransactionReplayKey({
      stationId,
      sourceMode: 'unsupervised',
      fpId,
      transSeqNo,
    })
    const pumpLockKey = buildTransactionPumpLockKey({
      stationId,
      sourceMode: 'unsupervised',
      fpId,
    })

    if (!beginReplayKey(key)) continue

    let previousCheckpointStage: string | null = null
    let previousCheckpointSuccessAt: string | null = null

    try {
      await withReplayLock(pumpLockKey, async () => {
        const checkpoint =
          lockOwnership === 'owned'
            ? await forecourtJplTransactionCheckpointRepo.getByKey({
                stationId,
                sourceMode: 'unsupervised',
                fpId,
                transSeqNo,
              })
            : null
        previousCheckpointStage = checkpoint?.lifecycle_stage ?? null
        previousCheckpointSuccessAt = checkpoint?.last_success_at ?? null

        if (
          shouldSuppressRecentlyClearedOwnedReplay({
            lockId,
            currentPosId,
            replayStage: previousCheckpointStage,
            clearedAt: previousCheckpointSuccessAt,
            graceMs: boundedEnvInt(
              'VPOS_JPL_RECENT_CLEAR_STALE_GRACE_MS',
              30_000,
              1_000,
              120_000,
            ),
          })
        ) {
          markBufferCleared('unsupervised', fpId, transSeqNo)
          logger.info('[jplTcp]', {
            msg: 'ignoring recently cleared unsupervised transaction from stale DOMS buffer snapshot',
            stationId,
            fpId,
            transSeqNo: seq4,
            lockId,
            clearedAt: previousCheckpointSuccessAt,
          })
          return
        }

        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'unsupervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'discovered',
          lockId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          lastAttemptAt: new Date().toISOString(),
          lastError: null,
        })
        const durableClearPayload =
          checkpoint?.clear_payload_json?.data ??
          checkpoint?.clear_payload_json ??
          null
        const replayAction = resolveTransactionReplayAction({
          lockId,
          currentPosId,
          hasDurableClearPayload: Boolean(durableClearPayload),
        })

        if (replayAction === 'block_foreign') {
          await forecourtJplTransactionCheckpointRepo.upsert({
            stationId,
            sourceMode: 'unsupervised',
            fpId,
            transSeqNo,
            lifecycleStage: 'blocked_by_foreign_pos',
            lockId,
            ownerPosId: currentPosId,
            blockedByForeignPos: true,
            lastAttemptAt: new Date().toISOString(),
            lastError: `Locked by POS ${lockId}`,
          })
          logger.warn('[jplTcp]', {
            msg: 'unsupervised tx locked by another POS; skipping',
            stationId,
            fpId,
            transSeqNo: seq4,
            lockId,
            currentPosId,
          })
          return
        }

        if (
          replayAction === 'unlock_then_read' ||
          replayAction === 'resume_clear'
        ) {
          logger.warn('[jplTcp]', {
            msg: 'unsupervised tx locked by this POS; re-reading current DOMS transaction before capture/clear',
            stationId,
            fpId,
            transSeqNo: seq4,
            currentPosId,
          })
          await (client as any).request(
            buildUnlockUnsupervisedTransactionRequest({
              fpId: fpId2,
              posId: currentPosId,
              transSeqNo: seq4,
            }),
          )
        }

        markBufferRead('unsupervised', fpId, transSeqNo)

        const tx = await (client as any).request(
          buildReadUnsupervisedTransactionRequest({
            fpId: fpId2,
            posId: currentPosId,
            transSeqNo: seq4,
          }),
        )

        const txData = tx?.data ?? {}
        const unattendedCapture = extractJplUnattendedReceiptCapture(txData)
        const redactedTxData = redactJplSensitivePaymentData(txData)
        const clearPayload = buildUnattendedClearPayload({
          txData,
          posId: currentPosId,
        })
        const capturedClearPayload = redactJplSensitivePaymentData(clearPayload)

        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'unsupervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'read_locked',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          readAttemptsIncrement: 1,
          lastAttemptAt: new Date().toISOString(),
          readPayloadJson: redactedTxData,
          clearPayloadJson: unattendedCapture.hasReceiptData
            ? capturedClearPayload
            : redactedTxData,
          lastError: unattendedCapture.warnings.length
            ? unattendedCapture.warnings.join(' ')
            : null,
        })

        const moneyDue = Number(
          txData?.MoneyDue ??
            txData?.Money ??
            txData?.TransPars?.Money_e ??
            txData?.TransPars?.Money ??
            NaN,
        )
        const volume = Number(
          txData?.Vol ??
            txData?.Volume ??
            txData?.TransPars?.Vol_e ??
            txData?.TransPars?.Vol ??
            NaN,
        )

        const mappings = await getJplPumpMappings(stationId)
        const processed = await handleNormalizedTransactions(
          stationId,
          mappings,
          [
            {
              ...txData,
              sourceMode: 'unsupervised',
              isSupervised: false,
              raw: {
                ...txData,
                sourceMode: 'unsupervised',
                isSupervised: false,
                TransLockId: currentPosId,
              },
              fpId,
              transSeqNo,
              transLockId: currentPosId,
              fcGradeId:
                txData?.FcGradeId ??
                txData?.fcGradeId ??
                txData?.TransPars?.FcGradeId ??
                null,
              fpGradeOptionNo:
                txData?.FpGradeOptionNo ??
                txData?.fpGradeOptionNo ??
                txData?.TransPars?.FpGradeOptionNo ??
                null,
            },
          ],
        )

        const captured = processed.some(
          (item) =>
            item.sourceMode === 'unsupervised' &&
            Number(item.domsFpId) === fpId &&
            item.transSeqNo === transSeqNo &&
            item.persisted,
        )

        if (!captured) {
          throw new Error(
            `Refusing to clear unsupervised transaction before configured durable capture (fp=${fpId}, seq=${seq4})`,
          )
        }

        // Keep the unattended receipt/payment capture on the same durable row.
        // The row already exists from handleNormalizedTransactions; this conflict
        // update only supplements the DOMS unattended metadata before clear.
        await upsertTransactionFromNormalized(stationId, {
          fpId: String(fpId),
          transSeqNo: String(transSeqNo),
          isSupported: false,
          volume: Number.isFinite(volume) ? volume : null,
          moneyDue: Number.isFinite(moneyDue) ? moneyDue : null,
          unattendedCapture,
          payloadJson: {
            fpId: String(fpId),
            transSeqNo: String(transSeqNo),
            isSupported: false,
            volume: Number.isFinite(volume) ? volume : null,
            moneyDue: Number.isFinite(moneyDue) ? moneyDue : null,
            unattendedPayment: unattendedCapture.paymentJson ?? null,
            unattendedWarnings: unattendedCapture.warnings,
          },
        })

        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'unsupervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'clear_requested',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          clearAttemptsIncrement: 1,
          lastAttemptAt: new Date().toISOString(),
          clearPayloadJson: capturedClearPayload,
          lastError: null,
        })

        await (client as any).request(
          buildClearUnsupervisedTransactionRequest({
            fpId: fpId2,
            posId: currentPosId,
            transSeqNo: seq4,
            txData,
            payload: clearPayload,
          }),
        )
        await verifyTransactionAbsentFromBuffer({
          client,
          sourceMode: 'unsupervised',
          fpId: fpId2,
          transSeqNo: seq4,
        })

        markBufferCleared('unsupervised', fpId, transSeqNo)
        await forecourtJplReplayRepo.markTransactionCleared({
          stationId,
          sourceMode: 'unsupervised',
          fpId,
          transSeqNo,
        })
        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'unsupervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'cleared',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          lastSuccessAt: new Date().toISOString(),
          lastError: null,
        })
      })
    } catch (err) {
      if (
        previousCheckpointStage === 'cleared' &&
        isTransactionNotFoundReject(err)
      ) {
        markBufferCleared('unsupervised', fpId, transSeqNo)
        await forecourtJplTransactionCheckpointRepo.upsert({
          stationId,
          sourceMode: 'unsupervised',
          fpId,
          transSeqNo,
          lifecycleStage: 'cleared',
          lockId: currentPosId,
          ownerPosId: currentPosId,
          blockedByForeignPos: false,
          lastSuccessAt:
            previousCheckpointSuccessAt ?? new Date().toISOString(),
          lastError: null,
        })
        logger.info('[jplTcp]', {
          msg: 'DOMS confirmed previously cleared unsupervised transaction is absent; stale buffer snapshot ignored',
          stationId,
          fpId,
          transSeqNo: seq4,
          clearedAt: previousCheckpointSuccessAt,
        })
        continue
      }

      if (isAccessReject(err)) {
        markReplayCapability('unsupervised', 'unknown')
      }

      globalThis.__jplSeenTransactions?.delete(key)
      markBufferError('unsupervised', fpId, err)
      await forecourtJplTransactionCheckpointRepo.upsert({
        stationId,
        sourceMode: 'unsupervised',
        fpId,
        transSeqNo,
        lifecycleStage: 'failed',
        lockId,
        ownerPosId: currentPosId,
        blockedByForeignPos: lockOwnership === 'foreign',
        lastAttemptAt: new Date().toISOString(),
        lastError: checkpointErrorText(err),
      })
      logger.error('[jplTcp]', {
        msg: `unsupervised pull/clear failed fpId=${fpId} seq=${transSeqNo}`,
        error: serializeError(err),
      })
    } finally {
      endReplayKey(key)
    }
  }
}

export const reconcileTransactionBuffersOnStartup = async (args: {
  client: any
  stationId: string
  handleBufferStatusEvent: (eventType: string, payload: any) => Promise<void>
}) => {
  const { client, stationId, handleBufferStatusEvent } = args
  const mappings = await getJplPumpMappings(stationId)
  const pumpIds = Array.from(mappings.keys()).sort((a, b) => a - b)

  if (!pumpIds.length) {
    logger.info('[jplTcp] startup reconciliation skipped: no configured pumps')
    return
  }

  logger.info('[jplTcp] startup reconciliation sweep starting', {
    stationId,
    pumpIds,
    requestGapMs: boundedEnvInt(
      'VPOS_JPL_STARTUP_RECONCILIATION_GAP_MS',
      40,
      0,
      500,
    ),
  })

  for (const pumpId of pumpIds) {
    const fpId = String(pumpId).padStart(2, '0')

    if (canAttemptReplay('supervised')) {
      try {
        const sup = await requestTransactionBufferStatusWithFallback({
          client,
          sourceMode: 'supervised',
          fpId,
        })
        markReplayCapability('supervised', 'allowed')
        await handleBufferStatusEvent(
          sup.responseEventType,
          sup.response?.data ?? {},
        )
      } catch (err) {
        if (isAccessReject(err)) {
          markReplayCapability('supervised', 'unknown')
          logger.warn(
            '[jplTcp] supervised buffer status temporarily unavailable',
            {
              stationId,
              pumpId,
              err: serializeError(err),
            },
          )
        } else {
          logger.error(
            '[jplTcp] startup supervised buffer reconciliation failed',
            {
              stationId,
              pumpId,
              err: serializeError(err),
            },
          )
        }
      }
    }

    await pauseStartupReconciliation()

    if (canAttemptReplay('unsupervised')) {
      try {
        const unsup = await requestTransactionBufferStatusWithFallback({
          client,
          sourceMode: 'unsupervised',
          fpId,
        })
        markReplayCapability('unsupervised', 'allowed')
        await handleBufferStatusEvent(
          unsup.responseEventType,
          unsup.response?.data ?? {},
        )
      } catch (err) {
        if (isAccessReject(err)) {
          markReplayCapability('unsupervised', 'unknown')
          logger.warn(
            '[jplTcp] unsupervised buffer status temporarily unavailable',
            {
              stationId,
              pumpId,
              err: serializeError(err),
            },
          )
        } else {
          logger.error(
            '[jplTcp] startup unsupervised buffer reconciliation failed',
            {
              stationId,
              pumpId,
              err: serializeError(err),
            },
          )
        }
      }
    }

    await pauseStartupReconciliation()
  }

  logger.info('[jplTcp] startup reconciliation sweep completed', {
    stationId,
    pumpCount: pumpIds.length,
  })
}

export { canAttemptReplay }
