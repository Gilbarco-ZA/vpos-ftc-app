import { buildReceiptLines } from '@/src/shared/fiscalization/receipt/templates/KE'
import type { ReceiptPolicy } from '../../domain/receiptPolicy'

/** Reuses the live Kenya print template without touching the receipt builder. */
export const kenyaReceiptPolicy: ReceiptPolicy = {
  countryCode: 'KE',
  render: buildReceiptLines,
}
