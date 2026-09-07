import { getPrintJobStatus } from '@/src/modules/printing/application/getPrintJobStatus'
import {
  enqueueAutoPrintFiscalReceipt,
  requiresPreFiscalizationReceiptPrint,
} from '../../infrastructure/fiscalization/autoPrintFiscalReceipt'
import { sendTransactionToProxyNow } from '../../infrastructure/fiscalization/proxySenderWorker'

export async function sendTransactionToProxyNowCommand(
  input: Parameters<typeof sendTransactionToProxyNow>[0],
) {
  if (await requiresPreFiscalizationReceiptPrint(input.stationId)) {
    const print = await enqueueAutoPrintFiscalReceipt({
      stationId: input.stationId,
      transactionId: input.transactionId,
      offlinePrint: true,
      phase: 'before_fiscalization',
    })
    const job = print.printJobId
      ? await getPrintJobStatus(input.stationId, print.printJobId)
      : null
    if (job?.status !== 'DONE') {
      return {
        ok: false as const,
        skipped: true as const,
        reason:
          job?.status === 'FAILED'
            ? `Pre-fiscalization receipt printing failed: ${job.last_error || 'unknown printer error'}`
            : 'Pre-fiscalization receipt is queued. Fiscalization will continue after the printer confirms completion.',
        printJobId: print.printJobId,
        printStatus: job?.status ?? 'PENDING',
      }
    }
  }

  return sendTransactionToProxyNow(input)
}
