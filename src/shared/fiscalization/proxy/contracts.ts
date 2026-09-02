export type InvoiceLineProductFuelDto = {
  gradeId?: string | null
  gradeName?: string | null
  tankId?: string | null
  tankVolume?: number | null
  pumpId?: string | null
  nozzleId?: string | null
}

export type InvoiceLineProductDto = {
  productId?: string | null
  productCode?: string | null
  productClassCode?: string | null
  productTypeCode?: string | null
  description?: string | null
  unitOfMeasure?: string | null
  unitOfPackaging?: string | null
  quantity: number
  unitPrice?: number | null
  priceExtension?: number | null
  netTotal?: number | null
  commodityCode?: string | null
  hazardousIndicator?: boolean | null
  fuel?: InvoiceLineProductFuelDto | null
}

export type InvoiceLineTaxDto = {
  type?: string | null
  rate?: number
  base?: number | null
  amount?: number | null
  exemptionCode?: string | null
}

export type InvoiceLineDto = {
  lineType?: string | null
  lineId?: string | null
  product?: InvoiceLineProductDto | null
  taxes?: InvoiceLineTaxDto[] | null
  discounts?: any[] | null
}

export type InvoiceTotalDto = {
  priceExtension?: number | null
  discount?: number | null
  charge?: number | null
  net?: number | null
  tax?: number | null
  amount?: number | null
}

export type TanzaniaProxyInvoiceMetadata = {
  invoiceNumber: string
  rctVerificationNum: string
  zNumber: string
  dailyCounter: number
  globalCounter: number
  invoiceDate: string
  custIdType: string
  custId?: string | null
  custName?: string | null
  custMobile?: string | null
  issuedBy?: string | null
  isPosted?: boolean | null
  exchangeRate: number
  payments: Array<{
    paymentMode: string
    amount: number
  }>
}

export type ProxyInvoiceRequest = {
  deviceId?: string | null
  documentId?: string | null
  documentNumber?: string | null
  documentType?: string | null
  modificationType?: string | null
  issueDateTime: string
  currency?: string | null
  shiftId?: string | null
  createdByName?: string | null
  isOnline?: boolean | null
  offlineDocumentNumber?: string | null
  offlineReason?: string | null
  transactionUniqueNumber?: string | null
  seller?: any | null
  buyer?: any | null
  lines?: InvoiceLineDto[] | null
  totals?: InvoiceTotalDto | null
  payment?: any | null
  delivery?: any | null
  notes?: string | null
  countryCode?: string | null
  tanzania?: TanzaniaProxyInvoiceMetadata | null
}

export type ProxyInvoiceReceiptResponse = {
  companyName?: string | null
  companyMobile?: string | null
  companyTin?: string | null
  companyVrn?: string | null
  companySerial?: string | null
  companyTaxOffice?: string | null
  receiptNumber?: string | null
  receiptZNumber?: string | null
  receiptDate?: string | null
  receiptTime?: string | null
  receiptInternalData?: string | null
  receiptSignature?: string | null
  fiscalVerificationCode?: string | null
  fiscalQrCodeData?: string | null
}

export type ProxyInvoiceDetailsResponse = {
  isOnline?: boolean | null
  isFiscalized?: boolean | null
  documentType?: string | null
  documentNumber?: string | null
  receipt?: ProxyInvoiceReceiptResponse | null
}

export type ProxyInvoiceResponse = {
  error: boolean
  responseCode?: string | null
  message?: string | null
  documentId?: string | null
  documentNumber?: string | null
  status?: string | null
  revenueAuthorityCode?: string | null
  revenueAuthorityMessage?: string | null
  details?: ProxyInvoiceDetailsResponse | null
}

// ------------------------------
// Credit Notes
// ------------------------------

export type ProxyCreditNoteLineDto = {
  lineType?: string | null
  product?: InvoiceLineProductDto | null
  taxes?: Array<Pick<InvoiceLineTaxDto, 'type' | 'rate'>> | null
}

export type ProxyCreditNoteDto = {
  IsOnline?: boolean | null
  isOnline?: boolean | null
  DocumentId: string
  documentId?: string | null
  documentNumber?: string | null
  documentReference?: string | null
  documentType?: string | null
  modificationType?: string | null
  issueDateTime: string
  createdByName?: string | null
  reasonCode?: string | null
  reason?: string | null
  Lines: ProxyCreditNoteLineDto[]
  lines?: ProxyCreditNoteLineDto[]
}

export type ProxyCreditNotesRequest = {
  creditNotes: ProxyCreditNoteDto[]
}

export type ProxyProductResponse = {
  error: boolean
  responseCode?: string
  message?: string
  products: {
    responseCode: string
    message: string
    error: boolean
    productId: string
    status: string
    isFiscalized: boolean
  }[]
}

export interface ProxyProductDto {
  devFlowOverride?: string | null
  productId: string
  productCode: string
  productClassCode?: string | null
  productTypeCode?: string | null
  productName: string
  category?: string | null
  unitOfMeasure?: string | null
  unitOfPackaging?: string | null
  packSize?: number | null
  unitPrice?: number | null
  unitCost?: number | null
  currency?: string | null
  commodityCode?: string | null
  barcode?: string | null
  taxCode?: string | null
  taxRate?: number | null
  hazardousIndicator?: boolean
  createdByName?: string | null
  inUse: boolean
}

export interface ImportedProduct {
  id: string
  code: string
  name: string
  price: number
  currency: string
  taxCode?: string | null
  taxRate?: number | null
  hazardous?: boolean
  category?: string | null
}
