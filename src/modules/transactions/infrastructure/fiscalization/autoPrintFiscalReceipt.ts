import { queryOne } from '@/src/platform/db/postgres'

import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'
import { buildReferencePrintJobPayload } from '@/src/modules/printing/domain/printJobPayload'
import { getOrCreateLatestTransactionReceiptRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'

export type AutoPrintFiscalReceiptResult = {
  enabled: boolean
  enqueued: boolean
  receiptId: string | null
  printJobId: string | null
}

export async function enqueueAutoPrintFiscalReceipt(input: {
  stationId: string
  transactionId: string
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

  const printJobId = await enqueuePrintJob(
    input.stationId,
    'print.receipt',
    buildReferencePrintJobPayload({
      type: 'receipt',
      source: 'vpos.auto-print-receipt',
      receiptId: String(receipt.id),
      receiptNumber: String(receipt.receipt_number ?? ''),
    }),
    10,
    {
      idempotencyKey: `receipt:${input.transactionId}:default`,
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
