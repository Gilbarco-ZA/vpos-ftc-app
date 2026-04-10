import {
  restoreDeductionForCreditedTransactionRepo,
  syncDeductionForTransactionRepo,
} from '@/src/modules/tank-levels/infrastructure/tankLevelsRepo'

export async function syncDeductionForTransaction(
  stationId: string,
  transactionId: string,
) {
  return await syncDeductionForTransactionRepo(stationId, transactionId)
}
export async function restoreDeductionForCreditedTransaction(
  stationId: string,
  transactionId: string,
) {
  return await restoreDeductionForCreditedTransactionRepo(
    stationId,
    transactionId,
  )
}
