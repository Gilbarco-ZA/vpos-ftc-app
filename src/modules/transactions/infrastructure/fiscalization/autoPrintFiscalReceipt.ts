import { queryOne } from '@/src/platform/db/postgres'

import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'
import { buildReferencePrintJobPayload } from '@/src/modules/printing/domain/printJobPayload'
import { isTanzaniaCountry } from '@/src/modules/tanzania-fiscal/infrastructure/country'
import { getOrCreateLatestTransactionReceiptRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'
import { isOfflineProxySubmission } from './proxyOfflineSubmission'

export type AutoPrintFiscalReceiptResult = {
  enabled: boolean
  enqueued: boolean
  receiptId: string | null
  printJobId: string | null
}

async function resolveOfflinePrint(input: {
  stationId: string
  transactionId: string
  offlinePrint?: boolean
}) {
  if (input.offlinePrint != null) return input.offlinePrint === true

  const context = await queryOne<{
    country: string | null
    response_payload: unknown
  }>(
    `SELECT fs.country,
            event.response_payload
       FROM transactions t
       JOIN fuel_stations fs ON fs.id = t.station_id
       LEFT JOIN LATERAL (
         SELECT fe.response_payload
           FROM fiscalization_events fe
          WHERE fe.station_id = t.station_id
            AND fe.transaction_id = t.id
            AND fe.transport = 'proxy'
          ORDER BY fe.occurred_at DESC, fe.created_at DESC
          LIMIT 1
       ) event ON TRUE
      WHERE t.station_id = $1
        AND t.id = $2::uuid
      LIMIT 1`,
    [input.stationId, input.transactionId],
  )

  return Boolean(
    isTanzaniaCountry(context?.country) &&
      isOfflineProxySubmission(context?.response_payload),
  )
}

export async function enqueueAutoPrintFiscalReceipt(input: {
  stationId: string
  transactionId: string
  offlinePrint?: boolean
}): Promise<AutoPrintFiscalReceiptResult> {
  const settings = await queryOne<{ auto_print_receipts: boolean | null }>(
    `SELECT auto_print_receipts
       FROM station_settings
      WHERE station_id = $1
      LIMIT 1`,
    [input.stationId],
  )

  if (settings?.auto_print_receipts !== true) {
    return {
      enabled: false,
      enqueued: false,
      receiptId: null,
      printJobId: null,
    }
  }

  const receipt = await getOrCreateLatestTransactionReceiptRepo(
    input.stationId,
    input.transactionId,
  )
  if (!receipt?.id) {
    throw new Error(
      `Unable to create an automatic receipt for transaction ${input.transactionId}`,
    )
  }

  const offlinePrint = await resolveOfflinePrint(input)
  const printJobId = await enqueuePrintJob(
    input.stationId,
    'print.receipt',
    buildReferencePrintJobPayload({
      type: 'receipt',
      source: offlinePrint
        ? 'vpos.auto-print-offline-receipt'
        : 'vpos.auto-print-receipt',
      offlinePrint,
      receiptId: String(receipt.id),
      receiptNumber: String(receipt.receipt_number ?? ''),
    }),
    10,
    {
      idempotencyKey: offlinePrint
        ? `receipt:${input.transactionId}:offline`
        : `receipt:${input.transactionId}:default`,
      sourceTransactionId: input.transactionId,
      payloadMode: 'reference',
    },
  )

  return {
    enabled: true,
    enqueued: Boolean(printJobId),
    receiptId: String(receipt.id),
    printJobId: printJobId ? String(printJobId) : null,
  }
}
