import type { EnqueuePrintJobOptions } from '@/src/shared/print/queue'

import { enqueuePrintJob as sharedEnqueuePrintJob } from '@/src/shared/print/queue'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type { EnqueuePrintJobOptions }

export async function enqueuePrintJob(
  stationId: string,
  jobType: string,
  payload: unknown,
  priority = 0,
  options: EnqueuePrintJobOptions = {},
) {
  return await sharedEnqueuePrintJob(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(jobType, 'jobType'),
    payload ?? {},
    priority,
    options,
  )
}
