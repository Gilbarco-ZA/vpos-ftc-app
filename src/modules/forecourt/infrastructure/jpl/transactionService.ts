import { padId2 } from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'

import { validateJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import { getReplayCapabilities } from '@/src/modules/forecourt/infrastructure/jpl/replayState'

export const DEFAULT_TRANSACTION_PAR_IDS = [
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
  '66',
] as const

const toId2 = (value: unknown, fallback = '00') => {
  const text = String(value ?? '').trim()
  if (/^\d+$/.test(text)) {
    return text.padStart(2, '0')
  }
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return String(Math.max(0, Math.trunc(parsed))).padStart(2, '0')
  }
  return fallback
}

const toDec4 = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (/^\d+$/.test(text)) return text.padStart(4, '0')
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return String(Math.max(0, Math.trunc(parsed))).padStart(4, '0')
  }
  return ''
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
}) =>
  validateJplOutboundMessage({
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
  })

export const buildUnlockSupervisedTransactionRequest = (args: {
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
}) =>
  validateJplOutboundMessage({
    name: 'unlock_FpSupTrans_req',
    subCode: '00H',
    data: {
      FpId: toId2(args.fpId, '00'),
      PosId: toId2(args.posId, '00'),
      TransSeqNo: toDec4(args.transSeqNo),
    },
  })

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

  return validateJplOutboundMessage({
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
  })
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
  const extra = extractExtendedClearFields(args.txData ?? args.payload)
  const eptReceiptFormatId = pick(args.payload, [
    'EptReceiptFormatId',
    'eptReceiptFormatId',
  ])
  const eptReceiptItems = pick(args.payload, [
    'EptReceiptItems',
    'eptReceiptItems',
  ])
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
  const pendingRows = await forecourtJplReplayRepo.listPendingClearRows({
    stationId,
  })
  const capabilities = getReplayCapabilities()

  return {
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
  }
}
