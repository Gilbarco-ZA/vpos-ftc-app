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
import { getJplPumpMappings } from '@/src/modules/forecourt/infrastructure/jpl/pumpMappings'
import {
  beginReplayKey,
  canAttemptReplay,
  endReplayKey,
  markReplayCapability,
  withReplayLock,
} from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import {
  buildClearUnsupervisedTransactionRequest,
  buildReadUnsupervisedTransactionRequest,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'
import { forecourtJplReplayRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplReplayRepo'
import { forecourtJplTransactionsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionsRepo'
import { getStationLinkingWindowSecondsSafe } from '@/src/modules/transactions/infrastructure/linkingWindow'

export type HandleNormalizedTransactionsFn = (
  stationId: string,
  mappings: Map<number, any>,
  transactions: any[],
) => Promise<NormalizedTransactionResult[]>

const transParId = [
  '30',
  '31',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '49',
  '51',
  '52',
  '53',
  '54',
  '61',
  '62',
  '63',
  '64',
  '65',
]

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

  try {
    const response = await client.request({
      name,
      subCode: '03H',
      data: { FpId: fpId },
    } as any)

    return {
      response,
      responseEventType: name.startsWith('FpSup')
        ? 'FpSupTransBufStatus_resp_03H'
        : 'FpUnSupTransBufStatus_resp_03H',
    }
  } catch (err) {
    if (!isUnsupportedSubCodeReject(err)) throw err

    logger.warn(
      '[jplTcp] extended buffer status subCode unavailable; falling back',
      {
        name,
        fpId,
        err: serializeError(err),
      },
    )

    const response = await client.request({
      name,
      subCode: '00H',
      data: { FpId: fpId },
    } as any)

    return {
      response,
      responseEventType: name.startsWith('FpSup')
        ? 'FpSupTransBufStatus_resp_00H'
        : 'FpUnSupTransBufStatus_resp_00H',
    }
  }
}

async function upsertTransactionFromNormalized(
  stationId: string,
  tx: {
    fpId: string
    transSeqNo: string
    isSupported: boolean
    volume: number | null
    moneyDue: number | null
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
    payloadJson: {
      fpId: tx.fpId,
      transSeqNo: tx.transSeqNo,
      isSupported: tx.isSupported,
      volume: tx.volume,
      moneyDue: tx.moneyDue,
    },
  })
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
    const seenKey = `sup:${fpId}:${seq4}`
    const inFlightKey = `sup:${fpId}:${seq4}`

    if (globalThis.__jplSeenTransactions.has(seenKey)) continue
    if (!beginReplayKey(inFlightKey)) continue

    try {
      await withReplayLock(`sup:${fpId}`, async () => {
        if (globalThis.__jplSeenTransactions?.has(seenKey)) return

        if (lockId && lockId !== '00' && lockId !== currentPosId) {
          logger.warn('[jplTcp]', {
            msg: 'supervised tx locked by another POS; skipping',
            fpId,
            transSeqNo: seq4,
            lockId,
            currentPosId,
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

        if (lockId === currentPosId) {
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
        }

        const clearSeqNo = resolveClearSeqNo({
          fallbackSeqNo: transSeqNo,
          txData,
          replayRow,
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
      })
    } catch (err) {
      const kind = classifyReplayReject(err)
      if (kind === 'access_denied') {
        markReplayCapability('supervised', 'denied')
      }
      markBufferError('supervised', fpId, err)
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

    const fpId2 = String(fpId).padStart(2, '0')
    const seq4 = String(transSeqNo).padStart(4, '0')
    const key = `unsup:${fpId}:${seq4}`

    if (globalThis.__jplSeenTransactions.has(key)) continue
    if (!beginReplayKey(key)) continue

    try {
      markBufferRead('unsupervised', fpId, transSeqNo)

      const tx = await (client as any).request(
        buildReadUnsupervisedTransactionRequest({
          fpId: fpId2,
          posId: currentPosId,
          transSeqNo: seq4,
        }),
      )

      const txData = tx?.data ?? {}
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
      })

      await (client as any).request(
        buildClearUnsupervisedTransactionRequest({
          fpId: fpId2,
          posId: currentPosId,
          transSeqNo: seq4,
          txData,
          payload: { posId: currentPosId },
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
    } catch (err) {
      if (isAccessReject(err)) {
        markReplayCapability('unsupervised', 'denied')
        logger.error('[jplTcp]', {
          msg: `unsupervised replay denied by controller fpId=${fpId} seq=${transSeqNo}`,
          error: serializeError(err),
        })
        return
      }

      globalThis.__jplSeenTransactions?.delete(key)
      markBufferError('unsupervised', fpId, err)
      logger.error('[jplTcp]', {
        msg: `unsupervised pull/clear failed fpId=${fpId} seq=${transSeqNo}`,
        error: err,
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
