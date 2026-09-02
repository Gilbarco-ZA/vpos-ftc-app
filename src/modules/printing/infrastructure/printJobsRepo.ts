import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

import { printJobsSql } from './printJobs.sql'

export type PrintJobRow = {
  id: string
  station_id: string
  job_type: string
  payload: any
  attempts?: number
  max_attempts?: number
  source_transaction_id?: string | null
  source_report_id?: string | null
}

export const printJobsRepo = {
  async getDefaultPrinterConfigRow(stationId: string) {
    return await queryOne<any>(printJobsSql.selectDefaultPrinterConfig, [
      stationId,
    ])
  },

  async listEnabledPrinterConfigRows(stationId: string) {
    return await queryAll<any>(printJobsSql.selectEnabledPrinterConfigs, [
      stationId,
    ])
  },

  async getTransactionPumpNumber(stationId: string, transactionId: string) {
    const row = await queryOne<{ pump_number: number | null }>(
      printJobsSql.selectTransactionPumpNumber,
      [stationId, transactionId],
    )
    const pumpNumber = row?.pump_number
    return pumpNumber == null ? null : Number(pumpNumber)
  },

  async getReceiptPrintSource(
    stationId: string,
    transactionId: string,
    receiptId?: string | null,
  ) {
    return await queryOne<{
      id: string
      receipt_number: string
      plain_text_content: string | null
      html_content: string | null
      fiscal_data: unknown
      branding_snapshot: unknown
      station_country: string | null
      station_name: string | null
      station_tin: string | null
    }>(printJobsSql.selectReceiptPrintSource, [
      stationId,
      transactionId,
      receiptId ?? null,
    ])
  },

  async getReportPrintSource(stationId: string, reportId: string) {
    return await queryOne<{
      id: string
      report_type: string
      report_date_time: string | Date | null
      payload: unknown
    }>(printJobsSql.selectReportPrintSource, [stationId, reportId])
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
