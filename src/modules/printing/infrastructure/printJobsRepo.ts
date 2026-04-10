import { query, queryOne } from '@/src/platform/db/postgres'

import { printJobsSql } from './printJobs.sql'

export type PrintJobRow = {
  id: string
  station_id: string
  job_type: string
  payload: any
  attempts?: number
  max_attempts?: number
}

export const printJobsRepo = {
  async getDefaultPrinterConfigRow(stationId: string) {
    return await queryOne<any>(printJobsSql.selectDefaultPrinterConfig, [
      stationId,
    ])
  },

  async markDone(id: string) {
    await query(printJobsSql.markDone, [id])
  },

  async markFailed(id: string, err: string) {
    await query(printJobsSql.markFailed, [id, err.slice(0, 2000)])
  },

  async claimNextForStation(stationId: string) {
    return await queryOne<PrintJobRow>(printJobsSql.claimNextForStation, [
      stationId,
    ])
  },

  async claimNextForWorker(stationId: string) {
    return await queryOne<PrintJobRow>(printJobsSql.claimNextForWorker, [
      stationId,
    ])
  },

  async scheduleRetry(
    id: string,
    err: string,
    attempts: number,
    maxAttempts: number,
  ) {
    if (attempts >= maxAttempts) {
      await printJobsRepo.markFailed(id, err)
      return
    }

    const delaySeconds = Math.min(300, Math.pow(2, Math.max(1, attempts)))
    await query(printJobsSql.scheduleRetry, [
      id,
      err.slice(0, 2000),
      String(delaySeconds),
    ])
  },
}
