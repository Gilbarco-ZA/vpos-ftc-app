import { printJobsRepo } from '../infrastructure/printJobsRepo'

export async function getPrintJobStatus(stationId: string, jobId: string) {
  return await printJobsRepo.getPrintJobStatus(stationId, jobId)
}
