export type StockMovementType = 'STOCK_IN' | 'STOCK_OUT'
export type ProxyStatus = 'PENDING' | 'SENT' | 'FAILED' | 'NOT_REQUIRED'

export type StockProduct = {
  id: string
  productId: string
  productCode: string
  productName: string
  sku: string | null
  categoryCode: string | null
  categoryName: string | null
  unitOfMeasure: string
  unitCost: number
  currency: string
  availableQuantity: number
  lastMovementAt: string | null
  lastMovementType: StockMovementType | null
  lastProxyStatus: ProxyStatus | null
  proxyPendingCount: number
  proxyFailedCount: number
}

export type StockMovement = {
  id: string
  productRecordId: string
  productId: string
  productCode: string
  productName: string
  sku: string | null
  categoryCode: string | null
  categoryName: string | null
  unitOfMeasure: string
  movementType: StockMovementType
  reason: string
  quantity: number
  unitCost: number | null
  documentId: string
  documentReference: string | null
  remarks: string | null
  supplierName: string | null
  supplierPin: string | null
  supplierInvoiceNumber: string | null
  effectiveAt: string
  createdByName: string
  sourceType: 'MANUAL' | 'POS_TRANSACTION' | 'CSV_IMPORT'
  sourceTransactionId: string | null
  sourceAction: 'CAPTURE' | 'EDIT' | null
  proxyStatus: ProxyStatus
  proxySentAt: string | null
  proxyError: string | null
  createdAt: string
}

export type StockResponse = {
  products: StockProduct[]
  recentMovements: StockMovement[]
}

export type MovementForm = {
  movementType: StockMovementType
  productRecordId: string
  reason: string
  quantity: string
  unitCost: string
  effectiveAtLocal: string
  documentReference: string
  remarks: string
  supplierName: string
  supplierPin: string
  supplierInvoiceNumber: string
}

export type StatusMessage = {
  type: 'success' | 'error' | 'warn'
  message: string
}
