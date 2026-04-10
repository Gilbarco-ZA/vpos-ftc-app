export type ForecourtProduct = {
  productId: string
  productCode: string
  productName: string
  unitPrice?: number
  unitCost?: number
  currency?: string
  taxRate?: number
  productClassCode?: string
  productTypeCode?: string
  category?: string
  unitOfMeasure?: string
}

export type ForecourtTank = {
  tankNumber?: number
  tankCode?: string
  tankName?: string
  productId: string
  capacityLitres?: number
  lowLevelLitres?: number | null
  criticalLevelLitres?: number | null
  status?: string
}

export type ForecourtPump = {
  pumpNumber: number
  pumpCode?: string
  pumpName?: string
  hasNozzleSelector?: boolean
  status?: string
}

export type ForecourtNozzle = {
  pumpNumber: number
  nozzleNumber: number
  tankCode?: string
  tankNumber?: number
  productId?: string
}

export type ForecourtSnapshot = {
  source: string
  fetchedAt: string
  products: ForecourtProduct[]
  tanks: ForecourtTank[]
  pumps: ForecourtPump[]
  nozzles: ForecourtNozzle[]
}

export type ForecourtSyncResult = {
  ok: boolean
  source?: string
  fetchedAt?: string
  counts?: {
    products: number
    tanks: number
    pumps: number
    nozzles: number
  }
  error?: string
  warnings?: string[]
}
