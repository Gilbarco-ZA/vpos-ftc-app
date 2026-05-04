import { getEnvValue } from '@/src/shared/config/envDb'
import { kvGet } from '@/src/shared/storage/stationKv'

export type ProxyRequestResult = {
  ok: boolean
  status: number
  data: any
  url: string
}

type ProxyRequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  fallbackPath?: string
  query?: Record<string, any>
  body?: any
  headers?: Record<string, string | undefined>
  timeoutMs?: number
}

const normalizeBasePath = (raw: string) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed || trimmed === '/') return ''
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/+$/, '');
}

const normalizePath = (raw: string) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const resolveProxyBaseUrl = async (stationId?: string) => {
  const kvUrl = stationId
    ? (await kvGet<string>(stationId, 'proxy.baseUrl')) ||
      (await kvGet<string>(stationId, 'proxy.url')) ||
      (await kvGet<string>(stationId, 'proxy.base_url'))
    : null

  const envUrl = stationId
    ? (await getEnvValue(stationId, 'VPOS_PROXY_URL')) ||
      (await getEnvValue(stationId, 'VPOS_FISCALIZATION_URL'))
    : process.env.VPOS_PROXY_URL || process.env.VPOS_FISCALIZATION_URL

  const raw = String(kvUrl || envUrl || 'http://127.0.0.1:5555').trim()

  if (!raw) {
    throw new Error('VPOS_PROXY_URL is not configured')
  }

  return raw.replace(/\/+$/, '');
}

const requestOnce = async (
  baseUrl: string,
  path: string,
  opts: ProxyRequestOptions,
): Promise<ProxyRequestResult> => {
  const url = new URL(path, baseUrl)
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value === undefined || value === null || String(value).trim() === '')
        continue
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-request-id': `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`,
  }

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (opts.headers) {
    for (const [key, value] of Object.entries(opts.headers)) {
      if (value !== undefined) headers[key] = String(value)
    }
  }

  const controller =
    typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
      ? new AbortController()
      : null
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : null

  const res = await fetch(url.toString(), {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: controller?.signal,
  })

  if (timeoutId) clearTimeout(timeoutId)

  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()

  let data: any = raw
  if (/application\/json/i.test(contentType)) {
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = raw
    }
  }

  return { ok: res.ok, status: res.status, data, url: url.toString() }
}

export const proxyRequest = async (
  stationId: string | undefined,
  opts: ProxyRequestOptions,
): Promise<ProxyRequestResult> => {
  const baseUrl = await resolveProxyBaseUrl(stationId)
  const basePathValue = stationId
    ? (await getEnvValue(stationId, 'VPOS_PROXY_BASE_PATH', '/')) || '/'
    : (process.env.VPOS_PROXY_BASE_PATH ?? '/')
  const basePath = normalizeBasePath(basePathValue)
  const path = normalizePath(opts.path)
  const fallbackPath = normalizePath(opts.fallbackPath || opts.path)

  const candidates = [
    basePath ? `${basePath}${path}` : path,
    fallbackPath,
  ].filter((v, i, arr) => v && arr.indexOf(v) === i)

  let last: ProxyRequestResult | null = null
  for (const candidate of candidates) {
    last = await requestOnce(baseUrl, candidate, opts)
    if (last.status !== 404 && last.status !== 405) return last
  }

  return (
    last || {
      ok: false,
      status: 500,
      data: { error: true, message: 'Proxy request failed' },
      url: baseUrl,
    }
  )
}

export const registerDeviceViaProxy = async (
  stationId: string | undefined,
  payload: any,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/registration/register',
    fallbackPath: '/api/registration/register',
    body: payload,
  })
}

export const getRegistrationStatusViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/registration/status',
    fallbackPath: '/api/registration/status',
  })
}

export const getOfflineQueueStatsViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/offline/queue/stats',
    fallbackPath: '/api/offline/queue/stats',
  })
}

export const getOfflineQueuePendingViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/offline/queue/pending',
    fallbackPath: '/api/offline/queue/pending',
  })
}

export const getOfflineQueueItemViaProxy = async (
  stationId: string | undefined,
  requestId: string,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: `/api/offline/queue/item/${encodeURIComponent(requestId)}`,
    fallbackPath: `/api/offline/queue/item/${encodeURIComponent(requestId)}`,
  })
}

export const retryOfflineQueueItemViaProxy = async (
  stationId: string | undefined,
  requestId: string,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: `/api/offline/queue/retry/${encodeURIComponent(requestId)}`,
    fallbackPath: `/api/offline/queue/retry/${encodeURIComponent(requestId)}`,
  })
}

export const startOfflineQueueProcessingViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/offline/queue/start',
    fallbackPath: '/api/offline/queue/start',
  })
}

export const stopOfflineQueueProcessingViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/offline/queue/stop',
    fallbackPath: '/api/offline/queue/stop',
  })
}

export const getFiscalizationResultsSinceViaProxy = async (
  stationId: string | undefined,
  query: { since: string; limit?: number },
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/fiscalization/results/since',
    fallbackPath: '/api/fiscalization/results/since',
    query,
  })
}

export const uploadProductsViaProxy = async (
  stationId: string | undefined,
  payload: any,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/products',
    fallbackPath: '/api/products',
    body: payload,
    timeoutMs: 5_000,
  })
}

export const getProductStatusViaProxy = async (
  stationId: string | undefined,
  query: Record<string, any>,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/products/status',
    fallbackPath: '/api/products/status',
    query,
  })
}

export const getProductEventLogViaProxy = async (
  stationId: string | undefined,
  query: Record<string, any>,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/products/eventLog',
    fallbackPath: '/api/products/eventLog',
    query,
  })
}

export const getProductsViaProxy = async (
  stationId: string | undefined,
  query?: Record<string, any>,
) => {
  return proxyRequest(stationId, {
    method: 'GET',
    path: '/api/products',
    fallbackPath: '/api/products',
    query,
  })
}

/**
 * Check device registration status from vpos-proxy (does NOT require stationId).
 * Used at startup to determine if setup is required.
 */
export const checkProxyDeviceStatus = async (
  stationId?: string,
): Promise<{
  ok: boolean
  isRegistered: boolean
  proxyReachable: boolean
  proxyUrl: string
  deviceSettings?: any
  error?: string
}> => {
  let proxyUrl = ''
  try {
    proxyUrl = (await resolveProxyBaseUrl(stationId)).trim().replace(/\/+$/, '')
  } catch {
    proxyUrl = String(
      process.env.VPOS_PROXY_URL ||
        process.env.VPOS_FISCALIZATION_URL ||
        'http://127.0.0.1:5555',
    )
      .trim()
      .replace(/\/+$/, '')
  }

  if (!proxyUrl) {
    return {
      ok: false,
      isRegistered: false,
      proxyReachable: false,
      proxyUrl: '',
      error: 'VPOS_PROXY_URL not configured',
    }
  }

  const url = `${proxyUrl}/api/registration/status`
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(id)

    const data = await res.json().catch(() => ({}))
    return {
      ok: res.ok,
      isRegistered: Boolean(data?.isRegistered),
      proxyReachable: true,
      proxyUrl,
      deviceSettings: data?.deviceSettings || null,
    }
  } catch {
    // fall through to health check
  }

  // Try health check to see if proxy is reachable at all
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 1_000)
    const res = await fetch(`${proxyUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(id)
    return {
      ok: false,
      isRegistered: false,
      proxyReachable: res.ok,
      proxyUrl,
      error: 'Could not determine registration status',
    }
  } catch (e) {
    return {
      ok: false,
      isRegistered: false,
      proxyReachable: false,
      proxyUrl,
      error: 'Proxy not reachable',
    }
  }
}

/**
 * Register device via proxy without requiring stationId (for initial setup).
 */
export const registerDevicePublic = async (registrationCode: string) => {
  const proxyUrl = String(
    process.env.VPOS_PROXY_URL ||
      process.env.VPOS_FISCALIZATION_URL ||
      'http://127.0.0.1:5555',
  )
    .trim()
    .replace(/\/+$/, '')

  if (!proxyUrl) {
    return {
      ok: false,
      status: 500,
      data: { error: 'VPOS_PROXY_URL not configured' },
    }
  }

  const url = `${proxyUrl}/api/registration/register`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ RegistrationCode: registrationCode }),
    })

    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    // fall through to error
  }

  return {
    ok: false,
    status: 502,
    data: { error: 'Failed to reach proxy registration endpoint' },
  }
}

/**
 * Fetch site configuration from the proxy after device registration.
 */
export const getSiteConfigurationPublic = async () => {
  const proxyUrl = String(
    process.env.VPOS_PROXY_URL ||
      process.env.VPOS_FISCALIZATION_URL ||
      'http://127.0.0.1:5555',
  )
    .trim()
    .replace(/\/+$/, '')

  if (!proxyUrl) {
    return {
      ok: false,
      status: 500,
      data: { error: 'VPOS_PROXY_URL not configured' },
    }
  }

  const url = `${proxyUrl}/api/configuration/site`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    // fall through to error
  }

  return {
    ok: false,
    status: 502,
    data: { error: 'Failed to reach proxy configuration endpoint' },
  }
}

export const deregisterDeviceViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/registration/deregister',
    fallbackPath: '/api/registration/deregister',
  })
}

export const resetDeviceViaProxy = async (stationId: string | undefined) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/registration/reset',
    fallbackPath: '/api/registration/reset',
  })
}

export const refreshIdentityViaProxy = async (
  stationId: string | undefined,
) => {
  return proxyRequest(stationId, {
    method: 'POST',
    path: '/api/registration/refresh-identity',
    fallbackPath: '/api/registration/refresh-identity',
  })
}
