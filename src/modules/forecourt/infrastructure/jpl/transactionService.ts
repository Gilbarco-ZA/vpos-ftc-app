import * as DomsPosJpl from '@gilbarcoafs/doms-pos-jpl'

import { padId2 } from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import { getJplBufferHealth } from '@/src/shared/forecourt/jplState'

import { validateJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import {
  normalizeJplDec4,
  normalizeJplId2OrZero,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/types'
import { getReplayCapabilities } from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import {
  extractJplUnattendedReceiptCapture,
  resolveJplEptReceiptItems,
} from '@/src/modules/forecourt/infrastructure/jpl/unattendedTransactions'

const buildFpSupTransEnvelope = (DomsPosJpl as any).buildFpSupTransEnvelope as
  | ((input: {
      fpId: string
      posId: string
      transSeqNo: string
      transParIds?: string[]
    }) => any)
  | undefined

const buildClearFpSupTransEnvelope = (DomsPosJpl as any)
  .buildClearFpSupTransEnvelope as
  | ((input: {
      fpId: string
      posId: string
      transSeqNo: string
      subCode?: string
      extraData?: Record<string, unknown>
    }) => any)
  | undefined

const buildUnlockFpSupTransEnvelope = (DomsPosJpl as any)
  .buildUnlockFpSupTransEnvelope as
  | ((input: { fpId: string; posId: string; transSeqNo: string }) => any)
  | undefined

export const DEFAULT_TRANSACTION_PAR_IDS = ['51', '64', '65', '66'] as const

const toId2 = (value: unknown, fallback = '00') => {
  const selected = String(value ?? '').trim() || fallback
  if (!selected) return ''
  try {
    return normalizeJplId2OrZero(selected)
  } catch {
    return fallback
  }
}

const toDec4 = (value: unknown) => {
  try {
    return normalizeJplDec4(value)
  } catch {
    return ''
  }
}

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

const toPayload = (value: any) =>
  value?.data ?? value?.payload?.data ?? value?.payload ?? value ?? {}

export const resolveTransactionParIds = (payload: any) => {
  const fromPayload = pick(payload, ['TransParId', 'transParId'])
  if (Array.isArray(fromPayload) && fromPayload.length) {
    return fromPayload.map((entry) => toId2(entry, '')).filter(Boolean)
  }
  return [...DEFAULT_TRANSACTION_PAR_IDS]
}

export const extractTransactionCore = (payload: any) => {
  const data = toPayload(payload)
  const transPars = data?.TransPars ?? data?.transPars ?? {}
  const fpId =
    toId2(
      pick(data, ['FpId', 'fpId']) ?? pick(transPars, ['FpId', 'fpId']),
      '',
    ) || undefined
  const transSeqNo =
    toDec4(
      pick(data, ['TransSeqNo', 'transSeqNo']) ??
        pick(transPars, ['TransSeqNo', 'transSeqNo']),
    ) || undefined

  return {
    data,
    transPars,
    fpId,
    transSeqNo,
  }
}

export const extractExtendedClearFields = (payload: any) => {
  const { data, transPars } = extractTransactionCore(payload)
  const volE =
    pick(data, ['Vol_e', 'vol_e']) ?? pick(transPars, ['Vol_e', 'vol_e'])
  const moneyE =
    pick(data, ['Money_e', 'money_e']) ??
    pick(transPars, ['Money_e', 'money_e'])
  const money =
    pick(data, ['Money', 'money']) ?? pick(transPars, ['Money', 'money'])
  return {
    Vol_e:
      volE != null && String(volE).trim() !== ''
        ? String(volE).trim()
        : undefined,
    Money_e:
      moneyE != null && String(moneyE).trim() !== ''
        ? String(moneyE).trim()
        : undefined,
    Money:
      money != null && String(money).trim() !== ''
        ? String(money).trim()
        : undefined,
  }
}

export const buildReadSupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
  transParId?: unknown
}) => {
  const request = buildFpSupTransEnvelope
    ? buildFpSupTransEnvelope({
        fpId: toId2(args.fpId, '00'),
        posId: toId2(args.posId, '00'),
        transSeqNo: toDec4(args.transSeqNo),
        transParIds:
          Array.isArray(args.transParId) && args.transParId.length
            ? (args.transParId as any[])
                .map((entry) => toId2(entry, ''))
                .filter(Boolean)
            : [...DEFAULT_TRANSACTION_PAR_IDS],
      })
    : {
        name: 'FpSupTrans_req',
        subCode: '00H',
        data: {
          FpId: toId2(args.fpId, '00'),
          TransSeqNo: toDec4(args.transSeqNo),
          PosId: toId2(args.posId, '00'),
          TransParId:
            Array.isArray(args.transParId) && args.transParId.length
              ? (args.transParId as any[])
                  .map((entry) => toId2(entry, ''))
                  .filter(Boolean)
              : [...DEFAULT_TRANSACTION_PAR_IDS],
        },
      }

  return validateJplOutboundMessage(request)
}

export const buildUnlockSupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
}) => {
  const request = buildUnlockFpSupTransEnvelope
    ? buildUnlockFpSupTransEnvelope({
        fpId: toId2(args.fpId, '00'),
        posId: toId2(args.posId, '00'),
        transSeqNo: toDec4(args.transSeqNo),
      })
    : {
        name: 'unlock_FpSupTrans_req',
        subCode: '00H',
        data: {
          FpId: toId2(args.fpId, '00'),
          PosId: toId2(args.posId, '00'),
          TransSeqNo: toDec4(args.transSeqNo),
        },
      }

  return validateJplOutboundMessage(request)
}

export const buildClearSupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
  txData?: any
  payload?: any
}) => {
  const extra = extractExtendedClearFields(args.txData ?? args.payload)
  const paymentParameters = pick(args.payload, [
    'PaymentParameters',
    'paymentParameters',
  ])
  const useExtended = Boolean(extra.Vol_e || extra.Money_e || paymentParameters)

  const request = buildClearFpSupTransEnvelope
    ? buildClearFpSupTransEnvelope({
        fpId: toId2(args.fpId, '00'),
        posId: toId2(args.posId, '00'),
        transSeqNo: toDec4(args.transSeqNo),
        subCode: useExtended ? '04H' : '00H',
        extraData: {
          ...(extra.Money ? { Money: extra.Money } : {}),
          ...(extra.Vol_e ? { Vol_e: extra.Vol_e } : {}),
          ...(extra.Money_e ? { Money_e: extra.Money_e } : {}),
          ...(paymentParameters && typeof paymentParameters === 'object'
            ? { PaymentParameters: paymentParameters }
            : {}),
        },
      })
    : {
        name: 'clear_FpSupTrans_req',
        subCode: useExtended ? '04H' : '00H',
        data: {
          FpId: toId2(args.fpId, '00'),
          PosId: toId2(args.posId, '00'),
          TransSeqNo: toDec4(args.transSeqNo),
          ...(extra.Money ? { Money: extra.Money } : {}),
          ...(extra.Vol_e ? { Vol_e: extra.Vol_e } : {}),
          ...(extra.Money_e ? { Money_e: extra.Money_e } : {}),
          ...(paymentParameters && typeof paymentParameters === 'object'
            ? { PaymentParameters: paymentParameters }
            : {}),
        },
      }

  return validateJplOutboundMessage(request)
}

export const buildReadUnsupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
  transParId?: unknown
}) =>
  validateJplOutboundMessage({
    name: 'FpUnSupTrans_req',
    subCode: '00H',
    data: {
      FpId: toId2(args.fpId, '00'),
      TransSeqNo: toDec4(args.transSeqNo),
      PosId: toId2(args.posId, '00'),
      TransParId:
        Array.isArray(args.transParId) && args.transParId.length
          ? (args.transParId as any[])
              .map((entry) => toId2(entry, ''))
              .filter(Boolean)
          : [...DEFAULT_TRANSACTION_PAR_IDS],
    },
  })

export const buildUnlockUnsupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
}) =>
  validateJplOutboundMessage({
    name: 'unlock_FpUnSupTrans_req',
    subCode: '00H',
    data: {
      FpId: toId2(args.fpId, '00'),
      PosId: toId2(args.posId, '00'),
      TransSeqNo: toDec4(args.transSeqNo),
    },
  })

export const buildClearUnsupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
  txData?: any
  payload?: any
}) => {
  const txPayload = {
    ...(args.txData && typeof args.txData === 'object' ? args.txData : {}),
    ...(args.payload && typeof args.payload === 'object' ? args.payload : {}),
  }
  const extra = extractExtendedClearFields(txPayload)
  const unattendedCapture = extractJplUnattendedReceiptCapture(txPayload)
  const rawEptReceiptItems = resolveJplEptReceiptItems(txPayload)
  const eptReceiptFormatId =
    pick(args.payload, ['EptReceiptFormatId', 'eptReceiptFormatId']) ??
    pick(args.txData, ['EptReceiptFormatId', 'eptReceiptFormatId']) ??
    unattendedCapture.eptReceiptFormatId
  const eptReceiptItems =
    pick(args.payload, ['EptReceiptItems', 'eptReceiptItems']) ??
    pick(args.txData, ['EptReceiptItems', 'eptReceiptItems']) ??
    (Object.keys(rawEptReceiptItems).length ? rawEptReceiptItems : undefined)
  const useExtended = Boolean(
    extra.Vol_e || extra.Money_e || eptReceiptFormatId || eptReceiptItems,
  )

  return validateJplOutboundMessage({
    name: 'clear_FpUnSupTrans_req',
    subCode: useExtended ? '03H' : '00H',
    data: {
      FpId: toId2(args.fpId, '00'),
      PosId: toId2(args.posId, '00'),
      TransSeqNo: toDec4(args.transSeqNo),
      ...(extra.Money ? { Money: extra.Money } : {}),
      ...(extra.Vol_e ? { Vol_e: extra.Vol_e } : {}),
      ...(extra.Money_e ? { Money_e: extra.Money_e } : {}),
      ...(eptReceiptFormatId != null && String(eptReceiptFormatId).trim() !== ''
        ? { EptReceiptFormatId: padId2(String(eptReceiptFormatId).trim()) }
        : {}),
      ...(eptReceiptItems && typeof eptReceiptItems === 'object'
        ? { EptReceiptItems: eptReceiptItems }
        : {}),
    },
  })
}

export const getReplayStatusSummary = async (stationId: string) => {
  const { forecourtJplReplayRepo } =
    await import('@/src/modules/forecourt/infrastructure/repositories/forecourtJplReplayRepo')
  const { forecourtJplTransactionCheckpointRepo } =
    await import('@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionCheckpointRepo')
  const { forecourtJplTransactionRecoveryRepo } =
    await import('@/src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionRecoveryRepo')
  const [pendingRows, checkpointRows, recoveryRuns] = await Promise.all([
    forecourtJplReplayRepo.listPendingClearRows({
      stationId,
    }),
    forecourtJplTransactionCheckpointRepo.listActiveByStation({ stationId }),
    forecourtJplTransactionRecoveryRepo.listRecentByStation({
      stationId,
      limit: 10,
    }),
  ])
  const capabilities = getReplayCapabilities()
  const bufferHealth = getJplBufferHealth()
  const inMemorySupervisedDepth = Object.values(
    bufferHealth.supervised ?? {},
  ).reduce((sum, entry: any) => sum + Number(entry?.depth ?? 0), 0)
  const inMemoryUnsupervisedDepth = Object.values(
    bufferHealth.unsupervised ?? {},
  ).reduce((sum, entry: any) => sum + Number(entry?.depth ?? 0), 0)
  const failedClearCount = checkpointRows.filter(
    (row) => row.lifecycle_stage === 'failed' || row.last_error,
  ).length
  const staleLockCount = checkpointRows.filter((row) =>
    Boolean(row.blocked_by_foreign_pos),
  ).length
  const pendingCheckpointCount = checkpointRows.filter(
    (row) => row.lifecycle_stage !== 'cleared',
  ).length

  return {
    metrics: {
      inMemorySupervisedDepth,
      inMemoryUnsupervisedDepth,
      inMemoryBacklogDepth: inMemorySupervisedDepth + inMemoryUnsupervisedDepth,
      pendingReplayClearCount: pendingRows.length,
      activeCheckpointCount: checkpointRows.length,
      pendingCheckpointCount,
      staleLockCount,
      failedClearCount,
      lastBufferHealthAt: bufferHealth.updatedAt ?? null,
    },
    replayCapabilities: {
      supervised: capabilities.supervised,
      unsupervised: capabilities.unsupervised,
    },
    pendingReplayClears: pendingRows.map((row) => ({
      fpId: Number(row.fp_id),
      transSeqNo: Number(row.trans_seq_no),
      replayStage: row.replay_stage,
      lockId: row.lock_id,
      updatedAt: row.updated_at,
      lastError: row.last_error,
    })),
    transactionCheckpoints: checkpointRows.map((row) => ({
      sourceMode: row.source_mode,
      fpId: Number(row.fp_id),
      transSeqNo: Number(row.trans_seq_no),
      lifecycleStage: row.lifecycle_stage,
      lockId: row.lock_id,
      ownerPosId: row.owner_pos_id,
      blockedByForeignPos: Boolean(row.blocked_by_foreign_pos),
      readAttempts: Number(row.read_attempts ?? 0),
      clearAttempts: Number(row.clear_attempts ?? 0),
      updatedAt: row.updated_at,
      lastError: row.last_error,
    })),
    transactionRecoveryRuns: recoveryRuns.map((row) => ({
      id: row.id,
      triggerSource: row.trigger_source,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      rowsScanned: Number(row.rows_scanned ?? 0),
      retriesAttempted: Number(row.retries_attempted ?? 0),
      clearSuccessCount: Number(row.clear_success_count ?? 0),
      blockedCount: Number(row.blocked_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
      lastError: row.last_error,
    })),
  }
}
