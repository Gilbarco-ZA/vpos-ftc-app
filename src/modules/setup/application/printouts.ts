import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'
import { processNextPrintJob } from '@/src/modules/printing/application/processNextPrintJob'

type PrintoutRequest = {
  printerIP?: string
  printerIp?: string
  port?: number
  width?: number
}

async function enqueueAndProcess(
  stationId: string,
  jobType: string,
  payload: unknown,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const jobId = await enqueuePrintJob(
    normalizedStationId,
    jobType,
    ensurePlainObject(payload),
    10,
  )
  if (!jobId) return { success: false, error: 'Failed to enqueue print job' }

  try {
    const processed = await processNextPrintJob(normalizedStationId)
    if (!processed.processed) {
      return {
        success: false,
        jobId,
        processed,
        error: 'Print job was queued but not processed',
      }
    }
    if (processed.status === 'FAILED') {
      return {
        success: false,
        jobId,
        processed,
        error: 'Printer rejected or failed the test print job',
      }
    }
    return { success: true, jobId, processed }
  } catch (e: any) {
    return {
      success: false,
      jobId,
      error: e?.message || String(e) || 'Print job failed',
    }
  }
}

export async function checkPrinterPageWidth(
  stationId: string,
  payload: PrintoutRequest,
) {
  return enqueueAndProcess(stationId, 'setup.check_printer_page_width', payload)
}

export async function testTransactionPrintout(
  stationId: string,
  payload: PrintoutRequest,
) {
  return enqueueAndProcess(
    stationId,
    'setup.test_transaction_printout',
    payload,
  )
}

export async function testReportPrintout(
  stationId: string,
  payload: PrintoutRequest,
) {
  return enqueueAndProcess(stationId, 'setup.test_report_printout', payload)
}
