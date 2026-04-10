import { checkPrinterPageWidth } from '@/src/shared/setup/printouts'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function testPrinterConnection(
  stationId: string,
  payload: Record<string, any> = {},
) {
  return await checkPrinterPageWidth(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
