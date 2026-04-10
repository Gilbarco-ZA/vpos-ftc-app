export type FiscalEngine = string

export type FiscalRunResult = {
  status: 'SUCCESS' | 'FAILED'
  reference?: string
  rawResponse: string
  engine: FiscalEngine
  requestPayload?: unknown
  responsePayload?: unknown
  errorMessage?: string
}
