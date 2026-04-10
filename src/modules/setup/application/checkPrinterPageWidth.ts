import { checkPrinterPageWidth as checkPrinterPageWidthShared } from '@/src/shared/setup/printouts'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function checkPrinterPageWidth(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await checkPrinterPageWidthShared(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
