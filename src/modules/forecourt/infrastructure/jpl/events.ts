import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type {
  BufferMode,
  JplReplayEntry,
  NormalizedTransactionResult,
  PumpMapping,
} from '@/src/modules/forecourt/infrastructure/jpl/types'

import {
  extractNozzleNumber,
  mapJplMainState,
  resolveTransSeqNo,
  unwrapMultiMessage,
} from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtimeConfig'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { logger } from '@/src/shared/utils/logger'

import { getStationDecimalSettingsCached } from '@/src/modules/forecourt/infrastructure/decimalSettingsCache'
import {
  markBufferError,
  updateBufferHealthFromPointerList,
} from '@/src/modules/forecourt/infrastructure/jpl/bufferHealth'
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
import { normalizeForecourtEvent } from '@/src/modules/forecourt/infrastructure/normalize'
import {
  resolveTransactionAmount,
  resolveTransactionVolume,
} from '@/src/modules/forecourt/infrastructure/transactionValues'

const getSeenTransactions = () => {
  if (!globalThis.__jplSeenTransactions) {
    globalThis.__jplSeenTransactions = new Set<string>()
  }
  return globalThis.__jplSeenTransactions
}

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

  const seen = getSeenTransactions()
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

      const dedupeKey = `${stationId}:${sourceMode}:${domsFpId}:${transSeqNo}`
      if (seen.has(dedupeKey)) {
        logger.debug('[JPL]', {
          msg: 'skip tx: deduped',
          dedupeKey,
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
        })
        results.push({
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          persisted: true,
          dedupedInProcess: true,
        })
        continue
      }
      seen.add(dedupeKey)

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

      if (!mapping) {
        logger.debug('[JPL]', {
          msg: 'mapping missing for DOMS fpId -> ingest minimal',
          fpId: domsFpId,
          pumpNumber,
          availableDomsFpIds: Array.from(mappings.keys()).sort((a, b) => a - b),
          transSeqNo,
          lockId,
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
          fuelType: tx?.fuelType ?? null,
          amount: resolvedAmount,
          volume: resolvedVolume,
          occurredAt: null,
        })

        results.push({
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          persisted: Boolean(persistedId),
        })
        continue
      }

      const nozzleNumber =
        extractNozzleNumber(tx?.raw) ??
        Number(tx?.raw?.NozzleNumber ?? tx?.raw?.NozzleNo ?? NaN)

      const nozzle =
        (Number.isFinite(nozzleNumber ?? NaN)
          ? mapping.nozzles.find((n) => n.nozzleNumber === Number(nozzleNumber))
          : null) ??
        mapping.nozzles?.[0] ??
        null

      if (!nozzle) {
        logger.debug('[JPL]', {
          msg: 'no nozzle in mapping -> ingest minimal',
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          nozzleNumber,
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
          nozzleNumber: Number.isFinite(nozzleNumber ?? NaN)
            ? Number(nozzleNumber)
            : null,
          fuelType: tx?.fuelType ?? null,
          amount: resolvedAmount,
          volume: resolvedVolume,
          occurredAt: null,
        })

        results.push({
          sourceMode,
          pumpNumber,
          domsFpId,
          transSeqNo,
          lockId,
          persisted: Boolean(persistedId),
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
        occurredAt: null,
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

    const fpIdForHealth = entries[0]?.fpId ?? null
    updateBufferHealthFromPointerList(
      bufMode,
      fpIdForHealth,
      entries.map((t) => ({ transSeqNo: t.transSeqNo ?? null })),
    )

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

    if (bufMode === 'supervised') {
      await pullAndClearSupervisedTransactions({
        stationId,
        bufferEntries: dedupedEntries,
        handleNormalizedTransactions,
      })
    } else {
      await pullAndClearUnsupervisedTransactions({
        stationId,
        bufferEntries: dedupedEntries,
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
