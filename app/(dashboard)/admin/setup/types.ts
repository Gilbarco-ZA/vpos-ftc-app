export type SetupCurrent = {
  siteProfile: any | null
  tanks: any | null
  setupComplete: boolean
  setupStep?: string | null
  setupUpdatedAt?: string | null
  products: { count: number }
  printer: { configured: boolean; configs?: any[] }
  pumps: { config: any | null; liveState: any }
}

export type Product = {
  productId: string
  productName?: string
  name?: string
  productCode?: string
  code?: string
  unitPrice?: number
  price?: number
  currency?: string
}

export type DbTank = {
  id: string
  code: string
  name: string
  status: string
  productId: string
  productExternalId: string
  productName: string
  productCode: string
  capacityLitres: number
}

export type PumpNozzle = {
  nozzleId: string
  state?: string
  updatedAt?: number
  fuelType?: string
}

export type PumpState = {
  pumpId: string
  nozzles: PumpNozzle[]
  updatedAt?: number
}

export type PumpSnapshot = {
  stationId?: string
  pumps?: PumpState[]
  updatedAt?: number
}
