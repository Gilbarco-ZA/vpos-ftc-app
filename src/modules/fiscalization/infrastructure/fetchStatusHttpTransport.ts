import type {
  StatusHttpRequest, StatusHttpResult, StatusHttpTransport,
} from './swaggerStatusLookupPort'

export interface StatusProxyConnection {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

/** Configuration is injected by the caller, never read from global env here. */
export type StatusProxyConnectionResolver =
  (stationId: string) => Promise<StatusProxyConnection>

export type StatusFetch = typeof fetch

export function createFetchStatusHttpTransport(
  resolveConnection: StatusProxyConnectionResolver,
  fetchImpl: StatusFetch,
): StatusHttpTransport {
  return {
    async request(request: StatusHttpRequest): Promise<StatusHttpResult> {
      const connection = await resolveConnection(request.stationId)
      const { baseUrl, apiKey, timeoutMs } = connection
      if (!apiKey.trim()) throw new Error('Status lookup API key missing')
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
        throw new Error('Invalid status lookup timeout')
      }
      const base = new URL(baseUrl)
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
        base.search || base.hash) {
        throw new Error('Invalid status lookup base URL')
      }
      if (request.method !== 'GET' || !/^\/api\/(?:tanzania\/)?invoices\/status$/.test(request.path)) {
        throw new Error('Unsupported status lookup request')
      }
      const basePath = base.pathname.replace(/\/+$/, '')
      const url = new URL(base.origin + basePath + request.path)
      url.searchParams.set('DocumentId', request.query.DocumentId)
      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { accept: 'application/json', 'x-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      })
      if (!response.ok) return { ok: false, status: response.status, body: null }
      const type = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!type.includes('json')) return { ok: true, status: response.status, body: null }
      try {
        return { ok: true, status: response.status, body: await response.json() }
      } catch {
        return { ok: true, status: response.status, body: null }
      }
    },
  }
}
