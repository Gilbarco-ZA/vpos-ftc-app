import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { checkPrinterPageWidth as checkPrinterPageWidthShared } from '@/src/modules/setup/application/printouts'

export async function checkPrinterPageWidth(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await checkPrinterPageWidthShared(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
