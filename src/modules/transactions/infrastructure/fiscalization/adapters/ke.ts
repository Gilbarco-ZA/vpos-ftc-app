import type {
  FiscalAdapter,
  FiscalizationRequest,
  FiscalRunResult,
} from './types'

export const keAdapter: FiscalAdapter = {
  engine: 'KE',
  async run(req: FiscalizationRequest): Promise<FiscalRunResult> {
    return {
      status: 'FAILED',
      rawResponse: JSON.stringify({
        ok: false,
        error: 'KE adapter not implemented',
      }),
      engine: 'KE',
      requestPayload: { transactionId: req.transaction?.id },
      errorMessage: 'KE adapter not implemented',
    }
  },
}
