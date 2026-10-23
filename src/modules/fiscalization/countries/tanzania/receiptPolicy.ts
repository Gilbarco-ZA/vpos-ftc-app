import { buildReceiptLines } from '@/src/shared/fiscalization/receipt/templates/TZ'
import type { ReceiptPolicy } from '../../domain/receiptPolicy'

/** Reuses the live Tanzania TRA receipt template; no fiscal metadata is invented. */
export const tanzaniaReceiptPolicy: ReceiptPolicy = {
  countryCode: 'TZ',
  render: buildReceiptLines,
}
