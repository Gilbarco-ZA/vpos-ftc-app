import { renderEscpos } from '@/src/shared/printers/escposRenderer'

import { escposTcpPrintText } from '@/src/modules/printing/infrastructure/escposTcp'
import { parsePrinterDeviceConfig } from '@/src/modules/printing/infrastructure/printerConfig'
import { sendEscposRaw } from '@/src/modules/printing/infrastructure/receiptPrinter'
import { resolvePrinterForTransaction } from '@/src/modules/printing/infrastructure/resolvePrinterForTransaction'
import {
  makeWidthRuler,
  wrapTextToWidth,
} from '@/src/modules/printing/infrastructure/textFormat'

import type { PrintJobRow } from './printJobsRepo'
import { printJobsRepo } from './printJobsRepo'

export type { PrintJobRow } from './printJobsRepo'

type PrinterConfig = {
  ip: string
  port?: number
  width?: number
  timeoutMs?: number
}

const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : null
}

const toConnectionPrinter = (
  parsed: {
    host: string
    port?: number
    width?: number
    timeoutMs?: number
  } | null,
): PrinterConfig | null => {
  if (!parsed?.host) return null
  return {
    ip: parsed.host,
    port: parsed.port,
    width: parsed.width,
    timeoutMs: parsed.timeoutMs,
  }
}

async function getDefaultPrinterConfig(
  stationId: string,
): Promise<PrinterConfig | null> {
  const row = await printJobsRepo.getDefaultPrinterConfigRow(stationId)
  if (!row) return null
  return toConnectionPrinter(parsePrinterDeviceConfig(row.config_json || {}))
}

function extractTransactionId(payload: any): string | null {
  const candidates = [
    payload?.transactionId,
    payload?.sourceTransactionId,
    payload?.state?.transactionId,
    payload?.printable?.transactionId,
    payload?.data?.transactionId,
    payload?.data?.receipt?.transactionId,
    payload?.receipt?.transactionId,
  ]

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim()
    if (value) return value
  }

  return null
}

function extractPumpNumberFromPayload(payload: any): number | null {
  const candidates = [
    payload?.pumpNumber,
    payload?.pump_number,
    payload?.fpId,
    payload?.FpId,
    payload?.state?.pumpNumber,
    payload?.state?.pump_number,
    payload?.state?.fpId,
    payload?.data?.pumpNumber,
    payload?.data?.pump_number,
    payload?.data?.fpId,
    payload?.data?.receipt?.pump_number,
    payload?.data?.receipt?.pumpNumber,
    payload?.receipt?.pump_number,
    payload?.receipt?.pumpNumber,
    payload?.printable?.pumpNumber,
    payload?.printable?.pump_number,
    payload?.printable?.fpId,
    payload?.printable?.receipt?.pump_number,
    payload?.printable?.receipt?.pumpNumber,
  ]

  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate)
    if (numeric != null && numeric > 0) return numeric
  }

  return null
}

async function resolveJobPumpNumber(job: PrintJobRow): Promise<number | null> {
  const fromPayload = extractPumpNumberFromPayload(job.payload)
  if (fromPayload != null) return fromPayload

  const transactionId =
    String(job.source_transaction_id ?? '').trim() ||
    extractTransactionId(job.payload)
  if (!transactionId) return null

  return await printJobsRepo.getTransactionPumpNumber(
    job.station_id,
    transactionId,
  )
}

async function resolveAssignedPrinterConfig(job: PrintJobRow) {
  const explicitPrinterKey = String(
    job.payload?.printerKey ??
      job.payload?.printer_key ??
      job.payload?.deviceKey ??
      '',
  ).trim()

  const pumpNumberHint =
    extractPumpNumberFromPayload(job.payload) ??
    (await resolveJobPumpNumber(job))

  const resolved = await resolvePrinterForTransaction({
    stationId: job.station_id,
    transactionId:
      String(job.source_transaction_id ?? '').trim() ||
      extractTransactionId(job.payload),
    explicitPrinterKey,
    pumpNumberHint,
  })

  if (!resolved) return null
  return toConnectionPrinter(resolved.config)
}

async function printText(
  stationId: string,
  printer: PrinterConfig,
  text: string,
) {
  const width = printer.width || 48
  const wrapped = wrapTextToWidth(text, width)
  await escposTcpPrintText(wrapped, {
    host: printer.ip,
    port: printer.port ?? 9100,
    timeoutMs: printer.timeoutMs ?? 8000,
  })
}

async function printEscpos(
  stationId: string,
  printer: PrinterConfig,
  payload: Buffer,
) {
  await sendEscposRaw(payload, {
    host: printer.ip,
    port: printer.port ?? 9100,
    width: printer.width,
    timeoutMs: printer.timeoutMs,
  })
}

/**
 * Job handler. This function does the side-effect (printing). The worker handles
 * status transitions + retries.
 */
export async function handlePrintJob(job: PrintJobRow) {
  const { job_type, payload } = job

  // Per-job overrides
  const payloadIp = String(
    payload?.printerIP || payload?.printerIp || '',
  ).trim()
  const payloadPort = payload?.port ? Number(payload.port) : undefined
  const payloadWidth = payload?.width ? Number(payload.width) : undefined

  let printer: PrinterConfig | null = null
  if (payloadIp) {
    printer = { ip: payloadIp, port: payloadPort, width: payloadWidth }
  } else {
    printer = await resolveAssignedPrinterConfig(job)
    if (!printer) {
      printer = await getDefaultPrinterConfig(job.station_id)
    }
    if (printer && payloadWidth) printer.width = payloadWidth
  }

  if (!printer?.ip) {
    throw new Error(
      'No printer configured (set device_configs device_type=printer, or pass printerIP)',
    )
  }

  if (job_type === 'setup.check_printer_page_width') {
    const width = payloadWidth || printer.width || 48
    await printText(
      job.station_id,
      { ...printer, width },
      makeWidthRuler(width),
    )
    return
  }

  if (job_type === 'setup.test_transaction_printout') {
    const width = payloadWidth || printer.width || 48
    const sample = [
      'TEST TRANSACTION RECEIPT',
      `Width: ${width}`,
      '--------------------------------',
      'Pump: 1',
      'Fuel: DIESEL',
      'Vol : 12.34',
      'Total: 12345.67',
      'Fiscal Ref: ABC-123',
      '--------------------------------',
      'Thank you',
    ].join('\n')
    await printText(job.station_id, { ...printer, width }, sample)
    return
  }

  if (job_type === 'setup.test_report_printout') {
    const width = payloadWidth || printer.width || 48
    const sample = [
      'TEST REPORT',
      `Width: ${width}`,
      '--------------------------------',
      'Sales Summary',
      '  DIESEL   : 123.45 L',
      '  PETROL   :  98.76 L',
      'Total      :  222.21 L',
      '--------------------------------',
      'End',
    ].join('\n')
    await printText(job.station_id, { ...printer, width }, sample)
    return
  }

  if (job_type === 'print.receipt') {
    const width = payloadWidth || printer.width || 42
    const data = payload?.data || payload?.receipt || payload
    const escposBase64 = data?.escposBase64 || data?.escpos_base64
    if (escposBase64) {
      const buffer = Buffer.from(String(escposBase64), 'base64')
      await printEscpos(job.station_id, { ...printer, width }, buffer)
      return
    }

    if (Array.isArray(data?.receiptLines)) {
      const buffer = renderEscpos(data.receiptLines, { width })
      await printEscpos(job.station_id, { ...printer, width }, buffer)
      return
    }
    const text =
      data?.plainTextContent ||
      data?.plain_text_content ||
      data?.text ||
      data?.content ||
      ''
    if (!text) throw new Error('Receipt payload has no printable content')
    await printText(job.station_id, { ...printer, width }, String(text))
    return
  }

  if (job_type === 'print.report') {
    const width = payloadWidth || printer.width || 48
    const data = payload?.data || payload?.report || payload
    const text =
      data?.plainTextContent ||
      data?.plain_text_content ||
      data?.text ||
      data?.content ||
      ''
    if (!text) throw new Error('Report payload has no printable content')
    await printText(job.station_id, { ...printer, width }, String(text))
    return
  }

  throw new Error(`Unknown print job type: ${job_type}`)
}

/**
 * Legacy station-scoped processor (used by some admin/status paths).
 * Prefer running the dedicated worker instead.
 */
export async function processNextPrintJob(stationId: string) {
  const job = await printJobsRepo.claimNextForStation(stationId)

  if (!job) return { processed: false }

  try {
    await handlePrintJob(job)
    await printJobsRepo.markDone(job.id)
    return { processed: true, jobId: job.id, status: 'DONE' as const }
  } catch (e: any) {
    await printJobsRepo.markFailed(job.id, e?.message || 'Unknown error')
    return { processed: true, jobId: job.id, status: 'FAILED' as const }
  }
}
