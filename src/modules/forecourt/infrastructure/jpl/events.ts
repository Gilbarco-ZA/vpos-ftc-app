import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type {
  BufferMode,
  JplReplayEntry,
  NormalizedTransactionResult,
  PumpMapping,
} from '@/src/modules/forecourt/infrastructure/jpl/types'

import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'

import {
  extractNozzleNumber,
  mapJplMainState,
  resolveTransSeqNo,
  unwrapMultiMessage,
} from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import { getStationDecimalSettingsCached } from '@/src/modules/forecourt/infrastructure/decimalSettingsCache'
import { updateBufferHealthFromPointerList } from '@/src/modules/forecourt/infrastructure/jpl/bufferHealth'
import { pruneClearRejectQuarantineForBufferSnapshot } from '@/src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine'
import {
  ingestJplSupervisedTransaction,
  ingestJplUnsupervisedTransaction,
} from '@/src/modules/forecourt/infrastructure/jpl/ingestFromForecourt'
import { getJplPumpMappings } from '@/src/modules/forecourt/infrastructure/jpl/pumpMappings'
import {
  canAttemptReplay,
  pullAndClearSupervisedTransactions,
  pullAndClearUnsupervisedTransactions,
} from '@/src/modules/forecourt/infrastructure/jpl/replay'
import { resolveStationId } from '@/src/modules/forecourt/infrastructure/jpl/station'
import {
  resolveDomsFinishDateTime,
  resolveDomsTransactionIdentity,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionIdentity'
import {
  isTransactionReplayMappingReady,
  resolveReplayNozzleMapping,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'
import { normalizeForecourtEvent } from '@/src/modules/forecourt/infrastructure/normalize'
import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'
import {
  resolveTransactionAmount,
  resolveTransactionVolume,
} from '@/src/modules/forecourt/infrastructure/transactionValues'

const publishPos = async (msg: any) => {
  const bus = getRuntimeBus()
  await bus.publish('pos', msg)
}

export const handleNormalizedPumpStatus = async (
  stationId: string,
  mappings: Map<number, PumpMapping>,
  pumpStatus: any,
) => {
  const fpId = Number(pumpStatus?.fpId)
  if (!Number.isFinite(fpId)) return

  const mapping = mappings.get(fpId)
  const pumpNumber = mapping?.pumpNumber ?? fpId
  const payload = pumpStatus?.data ?? {}
  const nozzleNumber = extractNozzleNumber(payload)
  const state = mapJplMainState(
    payload?.FpMainState ?? payload?.mainState ?? pumpStatus?.status,
  )

  if (mapping && nozzleNumber != null) {
    const nozzle =
      mapping.nozzles.find((n) => n.nozzleNumber === nozzleNumber) ??
      mapping.nozzles[0]
    if (nozzle) {
      await publishPos({
        stationId,
        type: 'nozzle_state',
        pumpId: String(pumpNumber),
        nozzleId: nozzle.nozzleId,
        state,
      })
    }
  }

  const nozzles = mapping?.nozzles?.length
    ? mapping.nozzles.map((n) => ({
        nozzleId: n.nozzleId,
        fuelType: n.fuelType ?? undefined,
        state,
      }))
    : [{ nozzleId: String(nozzleNumber ?? 1), state }]

  await publishPos({
    stationId,
    type: 'pump_state',
    pumpId: String(pumpNumber),
    nozzles,
  })
}

export const handleNormalizedTransactions = async (
  stationId: string,
  mappings: Map<number, PumpMapping>,
  transactions: any[],
): Promise<NormalizedTransactionResult[]> => {
  logger.info('[JPL]', {
    msg: 'handleNormalizedTransactions',
    stationId,
    count: transactions?.length ?? 0,
    mappingKeys: Array.from(mappings.keys()).sort((a, b) => a - b),
  })

  const results: NormalizedTransactionResult[] = []

  for (const tx of transactions ?? []) {
    try {
      const fpIdRaw = tx?.fpId ?? tx?.raw?.FpId
      const fpId = Number(fpIdRaw)

      if (!Number.isFinite(fpId)) {
        logger.debug('[JPL]', {
          msg: 'skip tx: bad fpId',
          fpIdRaw,
          txKeys: Object.keys(tx ?? {}),
        })
        continue
      }

      const mapping = mappings.get(fpId)
      const pumpNumber = mapping?.pumpNumber ?? fpId
      const domsFpId = fpId
      const transSeqNo = resolveTransSeqNo(tx)
      if (transSeqNo == null || !Number.isFinite(transSeqNo)) {
        logger.debug('[JPL]', {
          msg: 'bad transSeqNo tx dump',
          fpId,
          keys: Object.keys(tx ?? {}),
          rawKeys: Object.keys(tx?.raw ?? {}),
          raw: tx?.raw,
        })
        continue
      }

      const lockId = tx?.transLockId ?? tx?.raw?.TransLockId ?? null
      const sourceMode: BufferMode =
        tx?.sourceMode === 'supervised' ||
        tx?.raw?.sourceMode === 'supervised' ||
        tx?.isSupervised === true ||
        tx?.raw?.isSupervised === true
          ? 'supervised'
          : 'unsupervised'

      const ingestFn =
        sourceMode === 'supervised'
          ? ingestJplSupervisedTransaction
          : ingestJplUnsupervisedTransaction

      const cfg = getForecourtRuntimeConfig()
      const stationDecimals = await getStationDecimalSettingsCached(stationId)
      const resolvedVolume = resolveTransactionVolume(
        tx,
        cfg.jplCountryCode,
        stationDecimals.volume,
      )
      const resolvedAmount = resolveTransactionAmount(
        tx,
        cfg.jplCountryCode,
        stationDecimals.money,
      )

      if (!mapping || !isTransactionReplayMappingReady(mapping)) {
        logger.warn('[JPL]', {
          msg: 'transaction capture deferred until DOMS mapping is complete',
          fpId: domsFpId,
          pumpNumber,
          availableDomsFpIds: Array.from(mappings.keys()).sort((a, b) => a - b),
          transSeqNo,
          lockId,
        })
        results.push({
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          persisted: false,
        })
        continue
      }

      const nozzleNumber =
        extractNozzleNumber(tx?.raw) ??
        Number(tx?.raw?.NozzleNumber ?? tx?.raw?.NozzleNo ?? NaN)

      const transPars =
        tx?.TransPars ??
        tx?.transPars ??
        tx?.raw?.TransPars ??
        tx?.raw?.transPars ??
        {}
      const gradeId =
        tx?.fcGradeId ??
        tx?.raw?.FcGradeId ??
        tx?.raw?.fcGradeId ??
        transPars?.FcGradeId ??
        transPars?.fcGradeId ??
        null
      const gradeOptionId =
        tx?.fpGradeOptionNo ??
        tx?.raw?.FpGradeOptionNo ??
        tx?.raw?.fpGradeOptionNo ??
        transPars?.FpGradeOptionNo ??
        transPars?.fpGradeOptionNo ??
        null
      const transactionIdentity = await resolveDomsTransactionIdentity({
        stationId,
        sourceMode,
        fpId: domsFpId,
        transSeqNo,
        transaction: tx,
      })
      const controllerFinishAt = resolveDomsFinishDateTime(tx)
      const nozzle = resolveReplayNozzleMapping({
        mapping,
        nozzleNumber,
        gradeId,
        gradeOptionId,
      })

      if (!nozzle) {
        logger.warn('[JPL]', {
          msg: 'nozzle mapping is ambiguous or missing; attempting correlation to an existing pump-session transaction',
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          nozzleNumber,
          gradeId,
          gradeOptionId,
          mappingNozzleCount: mapping.nozzles?.length ?? 0,
        })

        const persistedId = await ingestFn({
          stationId,
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          nozzleId: null,
          nozzleNumber: null,
          fuelType: null,
          amount: Number.isFinite(resolvedAmount ?? NaN)
            ? resolvedAmount
            : null,
          volume: Number.isFinite(resolvedVolume ?? NaN)
            ? resolvedVolume
            : null,
          occurredAt: controllerFinishAt,
          transactionIdentity,
          requireExistingSessionMatch: true,
        })

        if (persistedId) {
          results.push({
            sourceMode,
            pumpNumber,
            domsFpId,
            transSeqNo,
            lockId,
            persisted: true,
          })
          await publishPos({
            stationId,
            type: 'transaction',
            pumpId: String(pumpNumber),
            nozzleId: null,
            transSeqNo: String(transSeqNo),
            volume: Number.isFinite(resolvedVolume ?? NaN)
              ? resolvedVolume
              : undefined,
            amount: Number.isFinite(resolvedAmount ?? NaN)
              ? resolvedAmount
              : undefined,
            sourceMode,
          })
          continue
        }

        logger.warn('[JPL]', {
          msg: 'transaction capture deferred because nozzle mapping is ambiguous or missing and no matching pump-session transaction was found',
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          nozzleNumber,
          gradeId,
          gradeOptionId,
        })
        results.push({
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          persisted: false,
        })
        continue
      }

      const volume = resolvedVolume
      const amount = resolvedAmount

      logger.info('[JPL]', {
        msg: 'ingest tx',
        sourceMode,
        pumpNumber,
        domsFpId,
        transSeqNo,
        lockId,
        nozzleId: nozzle.nozzleId,
        nozzleNumber: nozzle.nozzleNumber,
        amount,
        volume,
      })

      const persistedId = await ingestFn({
        stationId,
        sourceMode,
        pumpNumber,
        domsFpId,
        transSeqNo,
        lockId,
        nozzleId: nozzle.nozzleId,
        nozzleNumber: nozzle.nozzleNumber,
        fuelType: nozzle.fuelType ?? null,
        amount: Number.isFinite(amount ?? NaN) ? amount : null,
        volume: Number.isFinite(volume ?? NaN) ? volume : null,
        occurredAt: controllerFinishAt,
        transactionIdentity,
      })

      results.push({
        sourceMode,
        pumpNumber,
        domsFpId,
        transSeqNo,
        lockId,
        persisted: Boolean(persistedId),
      })

      if (!persistedId) {
        throw new Error(
          'JPL transaction was not persisted; refusing to treat it as captured',
        )
      }

      const eventPayload = {
        stationId,
        type: 'transaction',
        pumpId: String(pumpNumber),
        nozzleId: nozzle?.nozzleId ?? null,
        transSeqNo: String(transSeqNo),
        volume: Number.isFinite(volume ?? NaN) ? volume : undefined,
        amount: Number.isFinite(amount ?? NaN) ? amount : undefined,
        sourceMode,
        fuelType: nozzle?.fuelType ?? undefined,
      }

      await publishPos(eventPayload)
    } catch (e: any) {
      const fpIdRaw = tx?.fpId ?? tx?.raw?.FpId
      const transSeqNo = resolveTransSeqNo(tx)
      logger.error('[JPL]', {
        msg: 'handleNormalizedTransactions failed for tx',
        stationId,
        fpId: Number(fpIdRaw),
        transSeqNo,
        err: e?.message ?? e,
      })
    }
  }

  return results
}

const parseJsonIfString = (payload: any) => {
  if (typeof payload !== 'string') return payload
  const s = payload.trim()
  if (!s) return payload
  if (!(s.startsWith('{') || s.startsWith('['))) return payload
  try {
    return JSON.parse(s)
  } catch {
    return payload
  }
}

export const handleJplEvent = async (eventType: string, payload: any) => {
  logger.debug('[jplTcp]', { eventType, payload: JSON.stringify(payload) })
  const stationId = await resolveStationId()
  if (!stationId) return

  let parsedPayload = parseJsonIfString(payload)
  if (
    eventType === 'FpSupTrans_resp_00H' &&
    parsedPayload &&
    typeof parsedPayload === 'object'
  ) {
    const p: any = parsedPayload
    const tp: any = p.TransPars ?? {}
    const money = tp.MoneyDue ?? tp.Money ?? p.MoneyDue ?? p.Money ?? null
    const vol = tp.Vol ?? tp.Volume ?? p.Vol ?? p.Volume ?? null

    parsedPayload = {
      ...p,
      MoneyDue: money,
      Vol: vol,
      sourceMode: 'supervised',
      isSupervised: true,
    }
  }

  const unwrapped = unwrapMultiMessage(eventType, parsedPayload)
  if (unwrapped) {
    for (const m of unwrapped) {
      const nestedEventType = String(m.__eventType ?? '').trim()
      const nestedPayload = m.payload ?? m.data ?? {}
      if (nestedEventType) {
        await handleJplEvent(nestedEventType.replace(/_$/, ''), nestedPayload)
      }
    }
    return
  }

  if (
    !String(eventType).startsWith('Fp') &&
    !String(eventType).startsWith('Fc') &&
    !String(eventType).startsWith('Tg') &&
    !String(eventType).startsWith('Wp') &&
    !String(eventType).startsWith('SiteDeliveryStatus') &&
    !String(eventType).startsWith('MultiMessage')
  ) {
    logger.debug('[jplTcp]', {
      msg: 'non-JPL domain event',
      eventType,
      parsedPayload,
    })
    return
  }

  const normalization = normalizeForecourtEvent(eventType, parsedPayload)
  const mappings = await getJplPumpMappings(stationId)

  if (normalization.pumpStatus) {
    await handleNormalizedPumpStatus(
      stationId,
      mappings,
      normalization.pumpStatus,
    )
  }

  if (!normalization.transactions?.length) return

  const isSupBuf = eventType.startsWith('FpSupTransBufStatus_resp_')
  const isUnsupBuf = eventType.startsWith('FpUnSupTransBufStatus_resp_')
  const isSupTx = eventType.startsWith('FpSupTrans_resp_')
  const isUnsupTx = eventType.startsWith('FpUnSupTrans_resp_')

  if (isSupBuf || isUnsupBuf) {
    const bufMode: BufferMode = isSupBuf ? 'supervised' : 'unsupervised'

    let entries = (normalization.transactions ?? [])
      .filter(
        (t) =>
          t?.fpId != null &&
          t?.transSeqNo != null &&
          Number.isFinite(Number(t.transSeqNo)),
      )
      .map((t) => ({
        fpId: Number(t.fpId),
        transSeqNo: Number(t.transSeqNo),
        transLockId: (t as any)?.transLockId ?? null,
      }))

    if (entries.length === 0) {
      const fpId = Number(
        (parsedPayload as any)?.FpId ?? (parsedPayload as any)?.fpId,
      )
      if (Number.isFinite(fpId)) {
        if (bufMode === 'supervised') {
          const rawList = (parsedPayload as any)?.TransInSupBuffer
          if (Array.isArray(rawList)) {
            entries = rawList
              .map((e: any) => ({
                fpId,
                transSeqNo: Number(e?.TransSeqNo ?? e?.transSeqNo),
                transLockId:
                  e?.TransLockId ?? e?.TransLockNo ?? e?.LockId ?? null,
              }))
              .filter((e: any) => Number.isFinite(e.transSeqNo))
          }
        } else {
          const rawList = (parsedPayload as any)?.TransInUnSupBuffer
          if (Array.isArray(rawList)) {
            entries = rawList
              .map((e: any) => ({
                fpId,
                transSeqNo: Number(e?.TransSeqNo ?? e?.transSeqNo),
                transLockId:
                  e?.TransLockId ?? e?.TransLockNo ?? e?.LockId ?? null,
              }))
              .filter((e: any) => Number.isFinite(e.transSeqNo))
          }
        }
      }
    }

    const payloadFpId = Number(
      (parsedPayload as any)?.FpId ?? (parsedPayload as any)?.fpId,
    )
    const fpIdForHealth =
      entries[0]?.fpId ?? (Number.isFinite(payloadFpId) ? payloadFpId : null)
    updateBufferHealthFromPointerList(
      bufMode,
      fpIdForHealth,
      entries.map((t) => ({ transSeqNo: t.transSeqNo ?? null })),
    )

    if (fpIdForHealth != null) {
      pruneClearRejectQuarantineForBufferSnapshot({
        stationId,
        sourceMode: bufMode,
        fpId: fpIdForHealth,
        presentTransSeqNos: entries
          .map((entry) => Number(entry.transSeqNo))
          .filter((value) => Number.isFinite(value)),
      })
    }

    if (!entries.length) return
    if (!canAttemptReplay(bufMode)) {
      logger.warn('[jplTcp]', {
        msg: 'replay skipped for denied buffer mode',
        bufMode,
        fpId: fpIdForHealth,
        entryCount: entries.length,
      })
      return
    }

    const dedupedEntries = Array.from(
      new Map(
        entries.map((e) => [
          `${bufMode}:${String(e.fpId)}:${String(e.transSeqNo)}`,
          e,
        ]),
      ).values(),
    ) as JplReplayEntry[]

    if (!dedupedEntries.length) return

    const replayableEntries = dedupedEntries.filter((entry) => {
      const fpId = Number(entry.fpId)
      const mapping = Number.isFinite(fpId) ? mappings.get(fpId) : null
      const ready = isTransactionReplayMappingReady(mapping)
      if (!ready) {
        logger.warn('[jplTcp]', {
          msg: 'transaction buffer replay deferred until pump/nozzle/product configuration is ready',
          stationId,
          bufMode,
          fpId: Number.isFinite(fpId) ? fpId : null,
          transSeqNo: entry.transSeqNo ?? null,
        })
      }
      return ready
    })

    if (!replayableEntries.length) return

    if (bufMode === 'supervised') {
      await pullAndClearSupervisedTransactions({
        stationId,
        bufferEntries: replayableEntries,
        handleNormalizedTransactions,
      })
    } else {
      await pullAndClearUnsupervisedTransactions({
        stationId,
        bufferEntries: replayableEntries,
        handleNormalizedTransactions,
      })
    }

    return
  }

  if (!(isSupTx || isUnsupTx)) return
  await handleNormalizedTransactions(
    stationId,
    mappings,
    normalization.transactions,
  )
}

type JplEventProcessingJob = {
  eventType: string
  payload: any
  queuedAt: number
  resolve: () => void
  reject: (error: unknown) => void
}

type JplEventProcessingQueueState = {
  pending: JplEventProcessingJob[]
  active: number
  enqueued: number
  completed: number
  failed: number
  lastPressureLogAt: number
}

type JplEventProcessingGlobals = typeof globalThis & {
  __vposJplEventProcessingQueue?: JplEventProcessingQueueState
}

const eventProcessingGlobals = () => globalThis as JplEventProcessingGlobals

const getJplEventProcessingConcurrency = () => {
  const configured = Number(process.env.VPOS_JPL_EVENT_CONCURRENCY)
  if (!Number.isFinite(configured)) return 1
  return Math.max(1, Math.min(2, Math.trunc(configured)))
}

const getJplEventProcessingQueue = () => {
  const globals = eventProcessingGlobals()
  if (!globals.__vposJplEventProcessingQueue) {
    globals.__vposJplEventProcessingQueue = {
      pending: [],
      active: 0,
      enqueued: 0,
      completed: 0,
      failed: 0,
      lastPressureLogAt: 0,
    }
  }
  return globals.__vposJplEventProcessingQueue
}

export const getJplEventProcessingQueueDiagnostics = () => {
  const queue = getJplEventProcessingQueue()
  const oldestQueuedAt = queue.pending[0]?.queuedAt ?? null
  return {
    active: queue.active,
    queued: queue.pending.length,
    concurrency: getJplEventProcessingConcurrency(),
    enqueued: queue.enqueued,
    completed: queue.completed,
    failed: queue.failed,
    oldestQueuedMs:
      oldestQueuedAt == null ? 0 : Math.max(0, Date.now() - oldestQueuedAt),
  }
}

const drainJplEventProcessingQueue = () => {
  const queue = getJplEventProcessingQueue()
  const concurrency = getJplEventProcessingConcurrency()

  while (queue.active < concurrency && queue.pending.length > 0) {
    const job = queue.pending.shift()!
    queue.active += 1

    void handleJplEvent(job.eventType, job.payload)
      .then(() => {
        queue.completed += 1
        job.resolve()
      })
      .catch((error) => {
        queue.failed += 1
        logger.error('[jplTcp]', {
          msg: 'event processing failed',
          eventType: job.eventType,
          error: serializeError(error),
          queue: getJplEventProcessingQueueDiagnostics(),
        })
        job.reject(error)
      })
      .finally(() => {
        queue.active -= 1
        queueMicrotask(drainJplEventProcessingQueue)
      })
  }
}

/**
 * Serialize normal inbound JPL event handling behind a small process-wide
 * budget. The deployed controller can omit response correlation IDs, so the
 * default of one worker also prevents transaction-replay handlers from
 * creating overlapping request/response flows that could be matched by FIFO
 * fallback rather than by correlation ID.
 */
export const enqueueJplEventProcessing = (
  eventType: string,
  payload: any,
): Promise<void> => {
  const queue = getJplEventProcessingQueue()
  queue.enqueued += 1

  const promise = new Promise<void>((resolve, reject) => {
    queue.pending.push({
      eventType,
      payload,
      queuedAt: Date.now(),
      resolve,
      reject,
    })
  })

  if (queue.pending.length >= 64) {
    const now = Date.now()
    if (now - queue.lastPressureLogAt >= 30_000) {
      queue.lastPressureLogAt = now
      logger.warn('[jplTcp]', {
        msg: 'event processing backlog',
        queue: getJplEventProcessingQueueDiagnostics(),
      })
    }
  }

  queueMicrotask(drainJplEventProcessingQueue)
  return promise
}
