import type {
  FiscalAdapter,
  FiscalizationRequest,
  FiscalRunResult,
} from './types'

export const mockAdapter: FiscalAdapter = {
  engine: 'mock',
  async run(req: FiscalizationRequest): Promise<FiscalRunResult> {
    const ref = `mock-${Date.now()}-${String(req.transaction?.id || 'txn').slice(0, 8)}`
    return {
      status: 'SUCCESS',
      reference: ref,
      rawResponse: JSON.stringify({ ok: true, reference: ref }),
      engine: 'mock',
      requestPayload: {
        transactionId: req.transaction?.id,
        customerTin: req.customer?.tin ?? null,
      },
      responsePayload: { reference: ref },
    }
  },
}
