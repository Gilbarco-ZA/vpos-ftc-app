import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { checkPrinterPageWidth } from '@/src/modules/setup/application/printouts'

export async function testPrinterConnection(
  stationId: string,
  payload: Record<string, any> = {},
) {
  return await checkPrinterPageWidth(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
