import { queryOne } from '@/src/platform/db/postgres'

import { getOrCreatePreFiscalizationReceipt } from '../../infrastructure/fiscalization/preFiscalizationReceipt'

export async function prepareReceiptPreview(input: {
  stationId: string
  transactionId: string
  previewMode: boolean
}) {
  if (!input.previewMode) return

  const workflow = await queryOne<{ print_receipt_order: string | null }>(
    `SELECT print_receipt_order
       FROM station_settings
      WHERE station_id = $1::uuid
      LIMIT 1`,
    [input.stationId],
  )

  if (workflow?.print_receipt_order !== 'before_fiscalization') return

  await getOrCreatePreFiscalizationReceipt({
    stationId: input.stationId,
    transactionId: input.transactionId,
  })
}
