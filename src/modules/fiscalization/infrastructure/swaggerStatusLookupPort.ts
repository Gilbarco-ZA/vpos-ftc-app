import type {
  FiscalStatusLookupPort,
  FiscalStatusLookupRequest,
  FiscalStatusLookupResult,
} from '../application/statusRecoveryService'
import { buildInvoiceStatusEndpoint, parseInvoiceStatusCollection } from '../application/swaggerStatusContract'

export interface StatusHttpRequest {
  stationId: string
  method: 'GET'
  path: string
  query: Readonly<{ DocumentId: string }>
}

export interface StatusHttpResult {
  ok: boolean
  status: number
  body: unknown
}

/**
 * Caller owns authenticated HTTP configuration, station scoping and timeouts.
 * The adapter does not access environment variables or the live proxy client.
 */
export interface StatusHttpTransport {
  request(request: StatusHttpRequest): Promise<StatusHttpResult>
}

export function createSwaggerStatusLookupPort(
  transport: StatusHttpTransport,
): FiscalStatusLookupPort {
  return {
    async lookup(request: FiscalStatusLookupRequest): Promise<FiscalStatusLookupResult> {
      const stationId = request.stationId.trim()
      if (!stationId) return { kind: 'unavailable', reason: 'Station ID is required' }
      const endpoint = buildInvoiceStatusEndpoint(request.countryCode, request.documentId)
      let result: StatusHttpResult
      try {
        result = await transport.request({
          stationId,
          method: endpoint.method,
          path: endpoint.path,
          query: endpoint.query,
        })
      } catch {
        return { kind: 'transport-error', reason: 'Invoice status transport failed' }
      }
      if (!result || !Number.isInteger(result.status) || result.status < 100 || result.status > 599) {
        return { kind: 'transport-error', reason: 'Invalid invoice status HTTP response' }
      }
      if (!result.ok || result.status < 200 || result.status >= 300) {
        return { kind: 'transport-error', reason: 'Invoice status HTTP request returned ' + result.status }
      }
      return parseInvoiceStatusCollection(endpoint.query.DocumentId, result.body)
    },
  }
}
