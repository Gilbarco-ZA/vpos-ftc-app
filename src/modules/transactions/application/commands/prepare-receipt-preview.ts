import { getOrCreatePreFiscalizationReceipt } from '../../infrastructure/fiscalization/preFiscalizationReceipt'
import { isPendingKenyaReceipt } from '../queries/is-pending-kenya-receipt'

export async function prepareReceiptPreview(input: {
  stationId: string
  transactionId: string
  previewMode: boolean
}) {
  if (!input.previewMode) return

  // Explicit preview uses the same idempotent pre-fiscal receipt materialization
  // as offline printing. This gives the preview the complete canonical receipt
  // identity (including Tanzania counters/verification QR) and ensures preview
  // and any later offline print render the same document rather than two
  // independently generated representations.
  await getOrCreatePreFiscalizationReceipt({
    stationId: input.stationId,
    transactionId: input.transactionId,
  })
}

/**
 * Materialize the canonical Kenya offline receipt for non-preview reads.
 * Keep the API route independent of persistence and fiscalization details.
 */
export async function preparePendingKenyaReceipt(input: {
  stationId: string
  transactionId: string
  previewMode: boolean
}): Promise<void> {
  if (input.previewMode) return
  if (!await isPendingKenyaReceipt(input.stationId, input.transactionId)) return

  await getOrCreatePreFiscalizationReceipt({
    stationId: input.stationId,
    transactionId: input.transactionId,
  })
}
