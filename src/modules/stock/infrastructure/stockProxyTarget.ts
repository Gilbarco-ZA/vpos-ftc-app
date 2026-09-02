const DEFAULT_PROXY_PORT = 5555
const DEFAULT_PROXY_URL = 'http://127.0.0.1:5555'
const DEFAULT_PROXY_BASE_PATH = '/proxy'

const trimOrNull = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export const normalizeStockProxyBasePath = (value: unknown): string => {
  const raw = trimOrNull(value)
  if (!raw || raw === '/') return ''
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`
  return prefixed.replace(/\/+$/, '')
}

export const buildStockProxyUrlFromHost = (
  rawHost: unknown,
  port = DEFAULT_PROXY_PORT,
): string | null => {
  const host = trimOrNull(rawHost)
  if (!host) return null

  try {
    const url = new URL(/^https?:\/\//i.test(host) ? host : `http://${host}`)
    url.protocol = url.protocol === 'https:' ? 'https:' : 'http:'
    url.port = String(port)
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.origin
  } catch {
    return null
  }
}

export const resolveDevelopmentStockProxyFallback = (
  nodeEnv: string | undefined,
  values: {
    proxyUrl?: string
    fiscalizationUrl?: string
    proxyBasePath?: string
  },
) => {
  if (nodeEnv === 'production') {
    return { baseUrl: null, basePath: null }
  }

  return {
    baseUrl: trimOrNull(values.proxyUrl) ?? trimOrNull(values.fiscalizationUrl),
    basePath: trimOrNull(values.proxyBasePath),
  }
}

export const resolveStockProxyTargetValues = (input: {
  nodeEnv: string | undefined
  configuredBaseUrl?: unknown
  configuredBasePath?: unknown
  persistedJplHost?: unknown
  environment?: {
    proxyUrl?: string
    fiscalizationUrl?: string
    proxyBasePath?: string
  }
}) => {
  const developmentFallback = resolveDevelopmentStockProxyFallback(
    input.nodeEnv,
    input.environment ?? {},
  )
  const baseUrl =
    trimOrNull(input.configuredBaseUrl) ??
    buildStockProxyUrlFromHost(input.persistedJplHost) ??
    developmentFallback.baseUrl ??
    DEFAULT_PROXY_URL
  const basePath = normalizeStockProxyBasePath(
    trimOrNull(input.configuredBasePath) ??
      developmentFallback.basePath ??
      DEFAULT_PROXY_BASE_PATH,
  )

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    basePath,
  }
}
