import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { testReportPrintout } from '@/src/modules/setup/application/printouts'

export async function runTestReportPrintout(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await testReportPrintout(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}
