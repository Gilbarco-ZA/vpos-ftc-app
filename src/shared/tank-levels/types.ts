export type TankOption = {
  id: string
  code: string
  name: string
  productId: string
  productName: string
  productCode: string
  capacityLitres: number
  unitPrice: number
  taxCode: string | null
  taxRate: number
  productClassCode: string | null
  productTypeCode: string | null
  unitOfMeasure: string | null
  unitOfPackaging: string | null
  hazardousIndicator: boolean | null
  extProductId: string | null
  extProductCode: string | null
  extProductClassCode: string | null
  extProductTypeCode: string | null
  extDescription: string | null
  extUnitOfMeasure: string | null
  extUnitOfPackaging: string | null
  extUnitPrice: number
  extTaxCode: string | null
  extHazardousIndicator: boolean | null
}

export type TankInventoryMovement = {
  id: string
  stationId: string
  tankId: string
  tankCode?: string
  tankName?: string
  productId?: string
  productName?: string
  productCode?: string
  movementType: 'STOCK_IN' | 'DEDUCTION' | string
  stockInType?: 'StockCount' | 'Delivery' | null
  documentId?: string | null
  quantityLitres: number
  unitPrice?: number | null
  purchaseDate?: string | null
  effectiveAt?: string | null
  supplierPin?: string | null
  supplierName?: string | null
  supplierInvoiceNumber?: string | null
  createdByName?: string | null
  proxyStatus?: string | null
  proxySentAt?: string | null
  sourceTransactionId?: string | null
  sourceTransactionReference?: string | null
  createdAt?: string | null
}

export type TankLevelSummary = {
  tankId: string
  tankCode: string
  tankName: string
  status: string
  productId: string
  productName: string
  productCode: string
  capacityLitres: number
  lowLevelLitres: number
  criticalLevelLitres: number
  liveVolumeLitres: number
  liveTcVolumeLitres: number
  liveTemperatureC: number
  liveVolumeUpdatedAt: string | null
  manualVolumeLitres: number
  manualVolumeRecordedAt: string | null
  baselineSource: string
  baselineLitres: number
  currentVolumeLitres: number
  movementBalanceLitres: number
  lastStockCountAt: string | null
  lastDeliveryAt: string | null
  lastDeductionAt: string | null
  proxyPendingCount: number
  proxyFailedCount: number
}

export type CreateStockEntryInput = {
  stationId: string
  tankId: string
  quantityLitres: number
  stockInType?: 'StockCount' | 'Delivery' | null
  unitPrice?: number | null
  purchaseDate?: string | null
  supplierPin?: string | null
  supplierName?: string | null
  supplierInvoiceNumber?: string | null
  createdByName?: string | null
  effectiveAt?: string | null
  documentId?: string | null
  sendToProxy?: boolean
}

export type CreateStockEntryResult = {
  movement: TankInventoryMovement | null
  proxy?: unknown
}
