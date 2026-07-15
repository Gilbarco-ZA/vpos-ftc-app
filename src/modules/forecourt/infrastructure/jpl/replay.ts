import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type {
  JplReplayEntry,
  NormalizedTransactionResult,
  ReplayRejectKind,
} from '@/src/modules/forecourt/infrastructure/jpl/types'

import {
  getSupervisedTxClearFields,
  resolveTransSeqNo,
  serializeError,
  toJplDecimalString,
} from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtimeConfig'
import { logger } from '@/src/shared/utils/logger'
import { shortenUUID } from '@/src/shared/utils/shortenUUID'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  markBufferCleared,
  markBufferError,
  markBufferRead,
} from '@/src/modules/forecourt/infrastructure/jpl/bufferHealth'
import { prepareJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import { getJplPumpMappings } from '@/src/modules/forecourt/infrastructure/jpl/pumpMappings'
import {
  beginReplayKey,
  canAttemptReplay,
  endReplayKey,
  markReplayCapability,
  withReplayLock,
} from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import {
  buildTransactionBufferEventType,
  buildTransactionPumpLockKey,
  buildTransactionReplayKey,
  classifyTransactionLockOwnership,
  JPL_TRANSACTION_BUFFER_SUBCODES,
  resolveTransactionReplayAction,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'
import {
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
import { getStationLinkingWindowSecondsSafe } from '@/src/modules/transactions/infrastructure/linkingWindow'

export type HandleNormalizedTransactionsFn = (
  stationId: string,
  mappings: Map<number, any>,
  transactions: any[],
) => Promise<NormalizedTransactionResult[]>

const transParId = [...DEFAULT_TRANSACTION_PAR_IDS]

export const normalizeLockId = (value: unknown): string | null => {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  return s.padStart(2, '0')
}

export const isAccessReject = (err: any) => {
  const text = String(err?.message ?? '')
  const rejectCode =
    err?.rejectMessage?.data?.RejectCode?.value ??
    err?.data?.RejectCode?.value ??
    null

  return rejectCode === '03H' || /request rejected/i.test(text)
}

const getRejectData = (err: unknown): Record<string, any> | null => {
  const anyErr = err as any
  return anyErr?.data ?? anyErr?.response?.data ?? anyErr?.cause?.data ?? null
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

const isUnsupportedSubCodeReject = (err: unknown): boolean => {
  const data = getRejectData(err)
  const rejectCode = String(
    data?.RejectCode?.value ?? data?.rejectCode?.value ?? '',
  ).toUpperCase()
  const infoText = getRejectInfoText(err).toLowerCase()

  if (rejectCode === '01H') return true
  if (rejectCode !== '02H') return false

  return (
    infoText.includes('subcode') ||
    infoText.includes('unknown') ||
    infoText.includes('object does not contain')
  )
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

const requestBufferStatusWithFallback = async (args: {
  client: any
  name: 'FpSupTransBufStatus_req' | 'FpUnSupTransBufStatus_req'
  fpId: string
}) => {
  const { client, name, fpId } = args

  const responseName = name.startsWith('FpSup')
    ? 'FpSupTransBufStatus_resp'
    : 'FpUnSupTransBufStatus_resp'

  let lastUnsupportedError: unknown = null
  for (const subCode of JPL_TRANSACTION_BUFFER_SUBCODES) {
    try {
      const response = await client.request(
        prepareJplOutboundMessage({
          name,
          subCode,
          data: { FpId: fpId },
        }) as any,
      )

      return {
        response,
        responseEventType: buildTransactionBufferEventType(
          responseName,
          response?.subCode ?? subCode,
        ),
      }
    } catch (err) {
      if (!isUnsupportedSubCodeReject(err)) throw err
      lastUnsupportedError = err
      logger.warn('[jplTcp] buffer status subCode unavailable; falling back', {
        name,
        fpId,
        subCode,
        err: serializeError(err),
      })
    }
  }

  throw lastUnsupportedError ?? new Error(`No supported ${name} subCode`)
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
    unattendedReceiptJson: tx.unattendedCapture?.receiptJson ?? null,
    unattendedPaymentJson: tx.unattendedCapture?.paymentJson ?? null,
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

  if (!globalThis.__jplSeenTransactions) {
    globalThis.__jplSeenTransactions = new Set()
  }

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

    if (globalThis.__jplSeenTransactions.has(seenKey)) continue
    if (!beginReplayKey(inFlightKey)) continue

    try {
      await withReplayLock(pumpLockKey, async () => {
        if (globalThis.__jplSeenTransactions?.has(seenKey)) return

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

        const lockOwnership = classifyTransactionLockOwnership({
          lockId,
          currentPosId,
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
        const replayRow = await forecourtJplReplayRepo.getByKey({
          stationId,
          fpId,
          transSeqNo,
        })

        let txData: any | null = null
        let clearFields: { Vol_e: string; Money_e: string } | null = null

        if (lockOwnership === 'owned') {
          if (
            replayRow?.replay_stage === 'captured' &&
            replayRow?.clear_fields_json
          ) {
            logger.info('[jplTcp]', {
              msg: 'supervised tx locked by this POS; resuming clear from durable state',
              fpId,
              transSeqNo: seq4,
              currentPosId,
            })
            clearFields = replayRow.clear_fields_json
          } else {
            logger.warn('[jplTcp]', {
              msg: 'supervised tx locked by this POS without durable captured state; unlocking then rereading',
              fpId,
              transSeqNo: seq4,
              currentPosId,
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

            await forecourtJplReplayRepo.upsert({
              stationId,
              fpId,
              transSeqNo,
              replayStage: 'read_locked',
              lockId: currentPosId,
              readPayloadJson: txData,
              clearFieldsJson: clearFields,
              lastError: null,
            })
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
          }
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

          await forecourtJplReplayRepo.upsert({
            stationId,
            fpId,
            transSeqNo,
            replayStage: 'read_locked',
            lockId: currentPosId,
            readPayloadJson: txData,
            clearFieldsJson: clearFields,
            lastError: null,
          })
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
              item.pumpNumber === fpId &&
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
          clearPayloadJson: { PaymentParameters: {}, ...clearFields },
          lastError: null,
        })

        await (client as any).request({
          name: 'clear_FpSupTrans_req',
          subCode: '04H',
          data: {
            FpId: fpId2,
            PosId: currentPosId,
            TransSeqNo: clearSeqNo,
            PaymentParameters: {},
            ...clearFields,
          },
        })

        markBufferCleared('supervised', fpId, transSeqNo)
        globalThis.__jplSeenTransactions?.add(seenKey)

        await forecourtJplReplayRepo.markTransactionCleared({
          stationId,
          sourceMode: 'supervised',
          fpId,
          transSeqNo,
          // transLockId: currentPosId,
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
      const kind = classifyReplayReject(err)
      if (kind === 'access_denied') {
        markReplayCapability('supervised', 'denied')
      }
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
  const { bufferEntries, stationId } = args
  const client = globalThis.__jplTcpClient
  if (!client) return

  if (!globalThis.__jplSeenTransactions) {
    globalThis.__jplSeenTransactions = new Set()
  }

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

    if (globalThis.__jplSeenTransactions.has(key)) continue
    if (!beginReplayKey(key)) continue

    try {
      await withReplayLock(pumpLockKey, async () => {
        if (globalThis.__jplSeenTransactions?.has(key)) return

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

        const checkpoint =
          lockOwnership === 'owned'
            ? await forecourtJplTransactionCheckpointRepo.getByKey({
                stationId,
                sourceMode: 'unsupervised',
                fpId,
                transSeqNo,
              })
            : null
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

        if (replayAction === 'resume_clear' && durableClearPayload) {
          logger.info('[jplTcp]', {
            msg: 'unsupervised tx locked by this POS; resuming clear from durable checkpoint',
            stationId,
            fpId,
            transSeqNo: seq4,
            currentPosId,
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
            clearPayloadJson: durableClearPayload,
            lastError: null,
          })

          await (client as any).request(
            buildClearUnsupervisedTransactionRequest({
              fpId: fpId2,
              posId: currentPosId,
              transSeqNo: seq4,
              txData: checkpoint?.read_payload_json ?? durableClearPayload,
              payload: durableClearPayload,
            }),
          )

          globalThis.__jplSeenTransactions?.add(key)
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
          return
        }

        if (replayAction === 'unlock_then_read') {
          logger.warn('[jplTcp]', {
            msg: 'unsupervised tx locked by this POS without a durable clear payload; unlocking before reread',
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

        globalThis.__jplSeenTransactions?.add(key)
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
      if (isAccessReject(err)) {
        markReplayCapability('unsupervised', 'denied')
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
          msg: `unsupervised replay denied by controller fpId=${fpId} seq=${transSeqNo}`,
          error: serializeError(err),
        })
        return
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
    logger.warn('[jplTcp] startup reconciliation skipped: no configured pumps')
    return
  }

  logger.info('[jplTcp] startup reconciliation sweep starting', {
    stationId,
    pumpIds,
  })

  for (const pumpId of pumpIds) {
    const fpId = String(pumpId).padStart(2, '0')

    if (canAttemptReplay('supervised')) {
      try {
        const sup = await requestBufferStatusWithFallback({
          client,
          name: 'FpSupTransBufStatus_req',
          fpId,
        })
        markReplayCapability('supervised', 'allowed')
        await handleBufferStatusEvent(
          sup.responseEventType,
          sup.response?.data ?? {},
        )
      } catch (err) {
        if (isAccessReject(err)) {
          markReplayCapability('supervised', 'denied')
          logger.warn('[jplTcp] supervised buffer status not permitted', {
            stationId,
            pumpId,
            err: serializeError(err),
          })
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

    if (canAttemptReplay('unsupervised')) {
      try {
        const unsup = await requestBufferStatusWithFallback({
          client,
          name: 'FpUnSupTransBufStatus_req',
          fpId,
        })
        markReplayCapability('unsupervised', 'allowed')
        await handleBufferStatusEvent(
          unsup.responseEventType,
          unsup.response?.data ?? {},
        )
      } catch (err) {
        if (isAccessReject(err)) {
          markReplayCapability('unsupervised', 'denied')
          logger.warn('[jplTcp] unsupervised buffer status not permitted', {
            stationId,
            pumpId,
            err: serializeError(err),
          })
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
  }

  logger.info('[jplTcp] startup reconciliation sweep completed', {
    stationId,
    pumpCount: pumpIds.length,
  })
}

export { canAttemptReplay }
