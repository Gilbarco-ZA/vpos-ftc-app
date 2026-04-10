export type FiscalEngine = string

export type FiscalizationRequest = {
  stationId: string
  transaction: any
  customer: any | null
}

export type FiscalRunResult = {
  status: 'SUCCESS' | 'FAILED'
  reference?: string
  rawResponse: string
  engine: FiscalEngine
  requestPayload?: any
  responsePayload?: any
  errorMessage?: string
}

export interface FiscalAdapter {
  engine: FiscalEngine
  run(req: FiscalizationRequest): Promise<FiscalRunResult>
}
