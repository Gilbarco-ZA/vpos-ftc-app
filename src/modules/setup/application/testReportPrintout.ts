import { testReportPrintout } from '@/src/shared/setup/printouts'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function runTestReportPrintout(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await testReportPrintout(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
