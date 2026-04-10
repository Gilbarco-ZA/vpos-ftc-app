import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { fiscalizeTransactionLegacyRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function fiscalizeTransactionLegacy(
  stationId: string,
  payload: any,
) {
  return await fiscalizeTransactionLegacyRepo(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
