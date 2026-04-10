import { testTransactionPrintout } from '@/src/shared/setup/printouts'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function runTestTransactionPrintout(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await testTransactionPrintout(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
