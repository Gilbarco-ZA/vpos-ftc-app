/* ------------------------------------------------------------------ */
/*  Status                                                             */
/* ------------------------------------------------------------------ */

/**
 * Core transaction statuses stored in the database.
 * This strict union covers statuses that originate from the local system.
 */
export type TransactionStatus =
  | 'OPEN'
  | 'ALLOCATED'
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'FISCALIZING'
  | 'FISCALIZED'
  | 'SUCCESS'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PRINTED'
  | 'REPRINTED'
  | 'CREDITED'

/* ------------------------------------------------------------------ */
/*  Core Entity                                                        */
/* ------------------------------------------------------------------ */

/** Full transaction entity as stored in the `transactions` table (camelCase). */
export interface Transaction {
  id: string
  stationId: string
  customerId?: string
  pumpNumber: number
  transactionDateTime: Date
  totalAmount: number
  volume?: number
  fuelType?: string
  posReference?: string
  status: TransactionStatus
  allocatedAt?: Date
  allocatedBy?: string
  fiscalizationReference?: string
  fiscalizationResponse?: string
  fiscalizedAt?: Date
  linkingWindowExpiresAt?: Date
  autoFiscalized: boolean
  retryCount: number
  lastError?: string
  cloudTransactionId?: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

/* ------------------------------------------------------------------ */
/*  DB Row Types (snake_case — direct query results)                   */
/* ------------------------------------------------------------------ */

export type NonFiscalizedTransactionRow = {
  id: string
  transaction_date_time: string
  pos_reference: string | null
  receipt_number?: string | null
  pump_number: number
  fuel_type: string | null
  volume: number | null
  total_amount: number
  status: string
  retry_count: number
  fiscal_queue_enqueued_at: string | null
  last_error: string | null
  customer_id?: string | null
  customer_buyer_name?: string | null
  customer_tin?: string | null
  doms_source_system?: string | null
  odometer?: string | null
  payment_type?: string | null
  vehicle_reg_nr?: string | null
}

export type FiscalizedTransactionRow = {
  id: string
  fiscalized_at: string | null
  transaction_date_time: string | null
  pos_reference: string | null
  receipt_number?: string | null
  cloud_transaction_id: string | null
  pump_number: number
  fuel_type: string | null
  volume: number | null
  total_amount: number
  status: string
  fiscalization_reference: string | null
  buyer_name: string | null
  tin: string | null
}

/* ------------------------------------------------------------------ */
/*  Client DTO Types (camelCase — used in page components)             */
/* ------------------------------------------------------------------ */

export type TransactionListItem = {
  id: string
  transactionDateTime: string | null
  posReference: string | null
  receiptNumber: string | null
  pumpNumber: number
  fuelType: string | null
  volume: number | null
  totalAmount: number
  status: string
  retryCount: number
  fiscalQueueEnqueuedAt: string | null
  lastError: string | null
  customerId?: string | null
  customerName?: string | null
  customerTin?: string | null
  domsSourceSystem?: string | null
  odometer?: string | null
  paymentType?: string | null
  vehicleRegNr?: string | null
}

export type FiscalizedTransactionListItem = {
  id: string
  fiscalizedAt: string | null
  transactionDateTime: string | null
  posReference: string | null
  receiptNumber: string | null
  cloudTransactionId: string | null
  pumpNumber: number
  fuelType: string | null
  volume: number | null
  totalAmount: number
  status: string
  fiscalizationReference: string | null
  buyerName: string | null
  tin: string | null
}

/* ------------------------------------------------------------------ */
/*  Request / Response                                                 */
/* ------------------------------------------------------------------ */

export interface TransactionAllocateRequest {
  transactionId: string
  customerId: string
}

export interface ReportFilter {
  stationId: string
  startDate: Date
  endDate: Date
  pumpNumber?: number
  userId?: string
  status?: TransactionStatus
}

export interface TransactionReport {
  totalTransactions: number
  fiscalizedCount: number
  nonFiscalizedCount: number
  totalAmount: number
  customerCaptureCount: number
  transactions: Transaction[]
}

/* ------------------------------------------------------------------ */
/*  Adapter Interfaces                                                 */
/* ------------------------------------------------------------------ */

export interface POSTransaction {
  posReference: string
  pumpNumber: number
  transactionDateTime: Date
  totalAmount: number
  volume?: number
  fuelType?: string
}

export interface TransactionSourceAdapter {
  fetchOpenTransactions(
    stationId: string,
    pumpNumber?: number,
  ): Promise<POSTransaction[]>
}
