/**
 * Country fiscalization extension contract.
 * No production code imports this scaffold yet.
 *
 * Canonical models keep persistence, business workflow and HTTP transport
 * independent of country-specific wire payloads.
 */
export type FiscalCountryCode = 'KE' | 'TZ'
export type FiscalDocumentKind = 'invoice' | 'creditNote'
export type FiscalProcessingState =
  | 'pending'
  | 'processing'
  | 'fiscalized'
  | 'failed'
  | 'unknown'

export interface CanonicalProduct {
  id: string
  code: string
  name: string
  classCode?: string | null
  typeCode?: string | null
  unitOfMeasure?: string | null
  unitOfPackaging?: string | null
  price: number
  currency: string
  taxCode?: string | null
  hazardousIndicator?: boolean
}

export interface CanonicalTaxDetail {
  type: string
  rate: number
  base?: number | null
  amount?: number | null
  exemptionCode?: string | null
}

export interface CanonicalInvoiceTotals {
  priceExtension?: number | null
  discount?: number | null
  charge?: number | null
  net?: number | null
  tax?: number | null
  amount: number
}

export interface CanonicalInvoiceLine {
  product: CanonicalProduct
  quantity: number
  unitPrice: number
  taxRate?: number | null
  /** Existing, authoritative fiscal amounts: do not infer when supplied. */
  lineId?: string | null
  lineType?: string | null
  priceExtension?: number | null
  netTotal?: number | null
  taxes?: CanonicalTaxDetail[]
  discounts?: unknown[]
  commodityCode?: string | null
  fuel?: {
    gradeId?: string | null
    gradeName?: string | null
    tankId?: string | null
    tankGroupId?: string | null
    pumpId?: string | null
    nozzleId?: string | null
  }
}

export interface CanonicalTender {
  method: string
  amount: number
}

export interface CanonicalInvoice {
  documentId: string
  issuedAt: string
  currency: string
  lines: CanonicalInvoiceLine[]
  tenders: CanonicalTender[]
  buyer?: Record<string, unknown> | null
  /** Amounts must originate from transaction accounting, not a second VAT calculation. */
  totals?: CanonicalInvoiceTotals
  createdByName?: string
  isOnline?: boolean
  notes?: string
  metadata?: Record<string, unknown>
}

export interface CanonicalReceipt {
  documentId: string
  fiscalNumber?: string | null
  countryCode: FiscalCountryCode
  lines: CanonicalInvoiceLine[]
  totalAmount: number
  fiscalMetadata?: Record<string, unknown>
}

export interface ValidationIssue {
  field: string
  message: string
  code?: string
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; issues: ValidationIssue[] }

export interface CountryCapabilities {
  invoiceSubmission: boolean
  creditNotes: boolean
  productRegistration: boolean
  productStatus: boolean
  invoiceStatus: boolean
  receiptRendering: boolean
  dailyTotals: boolean
  tankInventory: boolean
  fiscalCounters: boolean
}

export interface FiscalEndpoint {
  method: 'GET' | 'POST'
  path: string
}

/** An adapter must never silently convert unsupported operations to another country. */
export interface CountryFiscalizationAdapter {
  readonly countryCode: FiscalCountryCode
  readonly capabilities: Readonly<CountryCapabilities>
  readonly endpoints: Readonly<Partial<Record<
    'invoice' | 'creditNote' | 'productRegistration' | 'productStatus' |
    'invoiceStatus' | 'dailyTotals' | 'tankInventory',
    FiscalEndpoint
  >>>
  readonly products: {
    defaultsForFuel(gradeName: string): Partial<CanonicalProduct>
    validate(product: CanonicalProduct): ValidationResult
    buildRegistration(products: readonly CanonicalProduct[]): unknown
  }
  readonly invoices: {
    validate(invoice: CanonicalInvoice): ValidationResult
    buildPayload(invoice: CanonicalInvoice): unknown
    buildCreditNote?(invoice: CanonicalInvoice): unknown
  }
  readonly receipts: {
    build(receipt: CanonicalReceipt): unknown
  }
  readonly fiscalization: {
    interpretStatus(response: unknown): FiscalProcessingState
    buildStatusRequest?(documentId: string): unknown
  }
}
