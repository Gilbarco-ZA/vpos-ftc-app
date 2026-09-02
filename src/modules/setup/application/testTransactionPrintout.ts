import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { testTransactionPrintout } from '@/src/modules/setup/application/printouts'

export async function runTestTransactionPrintout(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await testTransactionPrintout(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
