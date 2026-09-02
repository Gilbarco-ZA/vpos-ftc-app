import { getJplConfig } from '@/src/platform/integrations/jpl/config'
import { kvGet } from '@/src/shared/storage/stationKv'

const DEFAULT_PROXY_PORT = 5555
const DEFAULT_PROXY_BASE_URL = `http://127.0.0.1:${DEFAULT_PROXY_PORT}`

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return null
}

export const buildProxyBaseUrlFromDomsHost = (
  rawHost: unknown,
  port = DEFAULT_PROXY_PORT,
): string | null => {
  const host = String(rawHost ?? '').trim()
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

export const resolveProxySettingsBaseUrl = async (
  stationId?: string,
): Promise<string> => {
  if (stationId) {
    const [storedBaseUrl, storedUrl, storedLegacyUrl, storedEnvUrl] =
      await Promise.all([
        kvGet<string>(stationId, 'proxy.baseUrl'),
        kvGet<string>(stationId, 'proxy.url'),
        kvGet<string>(stationId, 'proxy.base_url'),
        kvGet<string>(stationId, 'env:VPOS_PROXY_URL'),
      ])

    const configured = firstNonEmpty(
      storedBaseUrl,
      storedUrl,
      storedLegacyUrl,
      storedEnvUrl,
    )
    if (configured) return configured.replace(/\/+$/, '')

    const jplConfig = await getJplConfig(stationId).catch(() => null)
    const domsProxyUrl = buildProxyBaseUrlFromDomsHost(jplConfig?.host)
    if (domsProxyUrl) return domsProxyUrl
  }

  return firstNonEmpty(
    process.env.VPOS_PROXY_URL,
    process.env.VPOS_FISCALIZATION_URL,
    DEFAULT_PROXY_BASE_URL,
  )!.replace(/\/+$/, '')
}
