import { enqueuePrintJob } from '@/src/shared/print/queue'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

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
