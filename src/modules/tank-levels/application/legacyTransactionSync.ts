import {
  restoreDeductionForCreditedTransaction as restoreImpl,
  syncDeductionForTransaction as syncImpl,
} from '@/src/modules/tank-levels/application/syncTransactionTankDeduction'

type TxArgs = { stationId: string; transactionId: string }

const normalizeArgs = (
  stationIdOrArgs: string | TxArgs,
  transactionId?: string,
): TxArgs => {
  if (typeof stationIdOrArgs === 'object' && stationIdOrArgs) {
    return {
      stationId: String(stationIdOrArgs.stationId),
      transactionId: String(stationIdOrArgs.transactionId),
    }
  }
  return {
    stationId: String(stationIdOrArgs),
    transactionId: String(transactionId ?? ''),
  }
}

export async function syncDeductionForTransaction(
  stationIdOrArgs: string | TxArgs,
  transactionId?: string,
) {
  const args = normalizeArgs(stationIdOrArgs, transactionId)
  return await syncImpl(args.stationId, args.transactionId)
}

export async function restoreDeductionForCreditedTransaction(
  stationIdOrArgs: string | TxArgs,
  transactionId?: string,
) {
  const args = normalizeArgs(stationIdOrArgs, transactionId)
  return await restoreImpl(args.stationId, args.transactionId)
}
