import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { processNextPrintJob as processNextPrintJobInfra } from '@/src/modules/printing/infrastructure/printJobs'

export async function processNextPrintJob(stationId: string) {
  return await processNextPrintJobInfra(
    requireNonEmptyString(stationId, 'stationId'),
  )
}
