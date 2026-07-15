import { kvGet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export const withTimeoutFetch = async (
  url: string,
  method: 'GET' | 'HEAD' = 'GET',
  timeoutMs = 5000,
) => {
  const normalizedUrl = requireNonEmptyString(url, 'url')
  const controller = new AbortController()
  const safeTimeoutMs = Math.max(100, Number(timeoutMs) || 5000)
  const id = setTimeout(() => controller.abort(), safeTimeoutMs)
  try {
    return await fetch(normalizedUrl, { method, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function resolveProxyBase(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  return String(
    (await kvGet<string>(normalizedStationId, 'proxy.baseUrl')) ||
      (await kvGet<string>(normalizedStationId, 'proxy.url')) ||
      process.env.VPOS_PROXY_URL ||
      'http://127.0.0.1:5555',
  ).replace(/\/+$/, '')
}
