import { processNextPrintJob as processNextPrintJobCanonical } from '@/src/modules/printing/application/processNextPrintJob'

export async function processNextPrintJob(stationId: string) {
  return await processNextPrintJobCanonical(stationId)
}
