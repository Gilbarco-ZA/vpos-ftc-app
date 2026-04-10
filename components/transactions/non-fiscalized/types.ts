import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import type { SelectOption } from '@/src/shared/types'

export type FiscalizeFormErrors = {
  tin?: string
  buyerName?: string
}

export type LocalReceiptFields = {
  odometer: string
  paymentType: 'CASH' | 'CARD'
  vehicleRegNr: string
}

export type CustomerState =
  | 'idle'
  | 'checking'
  | 'found'
  | 'not_found'
  | 'creating'
  | 'created'
  | 'error'

export type ResolvedCustomer = {
  id: string
  tin: string
  buyerName: string
  buyerType?: string | null
  pin?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  country?: string | null
  odometer?: string | null
  paymentType?: 'CASH' | 'CARD' | string | null
  vehicleRegNr?: string | null
}

export type FiscalizeResponseData = {
  allocated: boolean
  enqueued: boolean
  transactionId: string
  customerId?: string | null
  lastError?: string | null
}

export type NonFiscalizedFiscalizeSheetProps = {
  transaction:
    | import('@/src/shared/types/transactions').TransactionListItem
    | null
  stationCountry?: string | null
  csrfToken: string
  onClose: () => void
  onSuccess: (result: FiscalizeResponseData) => void
  buyerTypeOptions: SelectOption[]
  showToast: (variant: 'success' | 'error', message: string) => void
  decimals: DecimalSettings
}
