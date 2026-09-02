import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'

export type ReceiptStation = {
  name: string
  taxId?: string | null
  country?: string | null
  mobile?: string | null
  vrn?: string | null
  serial?: string | null
  uin?: string | null
  taxOffice?: string | null
}

export type ReceiptTransaction = {
  date: string
  invoiceNo: string
  fiscalReference: string
  status?: string | null
  attendant?: string | null
  receiptDate?: string | null
  receiptTime?: string | null
  pumpNumber?: string | null
  nozzleNumber?: string | null
}

export type ReceiptCustomer = {
  name: string
  tin: string
  buyerType?: string | null
  phone?: string | null
  email?: string | null
  odometer?: string | null
  paymentType?: string | null
  vehicleRegNr?: string | null
}

export type ReceiptItem = {
  name: string
  productCode?: string | null
  sku?: string | null
  taxCode: string
  quantity: number
  unitPrice: number
  amount: number
  taxRate?: number | null
  taxAmount?: number | null
}

export type TaxSummaryLine = {
  taxCode: string
  label: string
  rate: number
  taxableAmount: number
  taxAmount: number
}

export type ReceiptPayment = {
  method: string
  amount: number
  itemsCount: number
  currency?: string | null
  discount?: number | null
}

export type FiscalMeta = {
  scuId?: string | null
  cuInvoiceNo?: string | null
  receiptNumber: string
  internalData?: string | null
  signature?: string | null
  traReceiptNumber?: string | null
  dailyCount?: string | null
  globalCount?: string | null
  zNumber?: string | null
  verificationCode?: string | null
  verificationUrl?: string | null
}

export type ReceiptCustomization = {
  headerLines?: string[]
  footerLines?: string[]
  logoPath?: string | null
}

export type ReceiptQrPayload = {
  data: string
  verificationUrl?: string | null
}

export type FiscalReceiptModel = {
  station: ReceiptStation
  transaction: ReceiptTransaction
  customer: ReceiptCustomer
  items: ReceiptItem[]
  taxSummary: TaxSummaryLine[]
  payment: ReceiptPayment
  fiscalMeta: FiscalMeta
  qrPayload?: ReceiptQrPayload | null
  customization?: ReceiptCustomization
  /** Decimal formatting overrides for receipt values (0-3, default 2). */
  decimals: DecimalSettings
}

export type PrintableLine =
  | {
      type: 'text'
      value: string
      align?: 'left' | 'center' | 'right'
      bold?: boolean
    }
  | { type: 'separator' }
  | { type: 'qr'; value: string }
  | {
      type: 'image'
      asset: 'tra-receipt-start' | 'branding-logo' | 'tra-receipt-end'
      dataBase64?: string
      width?: number
      height?: number
    }
  | { type: 'empty'; lines?: number }
