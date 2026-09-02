import type { EnqueuePrintJobOptions } from '@/src/modules/printing/infrastructure/printQueue'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { enqueuePrintJob as enqueuePrintJobImpl } from '@/src/modules/printing/infrastructure/printQueue'

export type { EnqueuePrintJobOptions }

export async function enqueuePrintJob(
  stationId: string,
  jobType: string,
  payload: unknown,
  priority = 0,
  options: EnqueuePrintJobOptions = {},
) {
  return await enqueuePrintJobImpl(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(jobType, 'jobType'),
    payload ?? {},
    priority,
    options,
  )
}
