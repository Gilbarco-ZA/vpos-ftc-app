import { printJobsRepo } from '../infrastructure/printJobsRepo'
import { resolvePrinterForTransaction } from '../infrastructure/resolvePrinterForTransaction'

export async function resolveReceiptPrinter(input: {
  stationId: string
  transactionId: string
}) {
  const pumpNumber = await printJobsRepo.getTransactionPumpNumber(
    input.stationId,
    input.transactionId,
  )
  const printer = await resolvePrinterForTransaction({
    stationId: input.stationId,
    transactionId: input.transactionId,
    pumpNumberHint: pumpNumber,
  })
  return { pumpNumber, printer }
}
