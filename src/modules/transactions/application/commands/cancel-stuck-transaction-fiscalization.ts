import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { cancelStuckFiscalizationRepo } from '@/src/modules/transactions/infrastructure/fiscalization/cancel-stuck-fiscalization.repository'

export async function cancelStuckTransactionFiscalization(
  stationId: string,
  transactionId: string,
) {
  return await cancelStuckFiscalizationRepo({
    stationId: requireNonEmptyString(stationId, 'stationId'),
    transactionId: requireNonEmptyString(transactionId, 'transactionId'),
  })
}
