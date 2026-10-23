import type { FiscalReceiptModel, PrintableLine } from '@/src/shared/fiscalization/receipt/types'
import type { FiscalCountryCode } from './countryAdapter'

/** Fully enriched receipt models come from existing receiptBuilder, not this policy. */
export interface ReceiptPolicy {
  readonly countryCode: FiscalCountryCode
  render(model: FiscalReceiptModel): PrintableLine[]
}
