import type { ProxyRequestResult } from '@/src/shared/proxy/client'

import { proxyRequest } from '@/src/shared/proxy/client'

import { resolveProxySettingsBaseUrl } from '@/src/modules/proxy-settings/infrastructure/resolveProxySettingsBaseUrl'

export type ProxyQueueModules = Record<string, boolean>

export type ProxySettingsConfig = {
  cloudApiBase: string
  swaggerEndpointCloud: string
  swaggerEndpointInternal: string
  swaggerEndpointTanzania: string
  healthEndpoint: string
  swaggerCacheTimeout: number
  requestTimeout: number
  rateLimitWindowMs: number
  rateLimitMaxRequests: number
  fiscalNif: string
  fiscalEmissionLogic: number
  fiscalRepositoryId: string
  countryCode: string | null
  queueModules: ProxyQueueModules
}

export type ProxySettingsResponse = {
  settings: ProxySettingsConfig
  runtimeLastUpdated?: number | null
  endpointUrl?: string | null
}

export type ProxySettingsPatch = Partial<ProxySettingsConfig>

const SETTINGS_PATH = '/proxy/settings'

const callProxySettings = async (
  stationId: string | undefined,
  opts: {
    method: 'GET' | 'PATCH' | 'POST'
    path?: string
    body?: unknown
  },
): Promise<ProxyRequestResult> => {
  const baseUrl = await resolveProxySettingsBaseUrl(stationId)

  try {
    return await proxyRequest(stationId, {
      method: opts.method,
      path: opts.path ?? SETTINGS_PATH,
      fallbackPath: opts.path ?? SETTINGS_PATH,
      body: opts.body,
      timeoutMs: 8_000,
      baseUrl,
    })
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to reach vpos-proxy settings endpoint',
      },
      url: `${baseUrl}${SETTINGS_PATH}`,
    }
  }
}

export const getProxySettingsViaProxy = (stationId: string | undefined) =>
  callProxySettings(stationId, { method: 'GET' })

export const updateProxySettingsViaProxy = (
  stationId: string | undefined,
  patch: ProxySettingsPatch,
) => callProxySettings(stationId, { method: 'PATCH', body: patch })

const normalizeQueueModules = (value: unknown): ProxyQueueModules => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, enabled]) => [
      key,
      enabled === true,
    ]),
  )
}

export const extractProxySettingsPayload = (
  data: unknown,
  endpointUrl?: string | null,
): ProxySettingsResponse => {
  const payload = data && typeof data === 'object' ? (data as any) : {}
  const source =
    payload.settings && typeof payload.settings === 'object'
      ? payload.settings
      : payload

  return {
    settings: {
      cloudApiBase: String(source.cloudApiBase ?? ''),
      swaggerEndpointCloud: String(source.swaggerEndpointCloud ?? ''),
      swaggerEndpointInternal: String(source.swaggerEndpointInternal ?? ''),
      swaggerEndpointTanzania: String(source.swaggerEndpointTanzania ?? ''),
      healthEndpoint: String(source.healthEndpoint ?? ''),
      swaggerCacheTimeout: Number(source.swaggerCacheTimeout ?? 0),
      requestTimeout: Number(source.requestTimeout ?? 0),
      rateLimitWindowMs: Number(source.rateLimitWindowMs ?? 0),
      rateLimitMaxRequests: Number(source.rateLimitMaxRequests ?? 0),
      fiscalNif: String(source.fiscalNif ?? ''),
      fiscalEmissionLogic: Number(source.fiscalEmissionLogic ?? 0),
      fiscalRepositoryId: String(source.fiscalRepositoryId ?? ''),
      countryCode:
        source.countryCode == null
          ? null
          : String(source.countryCode).trim().toUpperCase() || null,
      queueModules: normalizeQueueModules(source.queueModules),
    },
    runtimeLastUpdated:
      payload.runtimeLastUpdated == null
        ? null
        : Number(payload.runtimeLastUpdated),
    endpointUrl: endpointUrl ?? null,
  }
}

export const getProxySettingsErrorMessage = (
  data: unknown,
  fallback = 'vpos-proxy settings request failed',
) => {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data !== 'object') return fallback

  const payload = data as any
  if (typeof payload.error === 'string') return payload.error
  if (typeof payload.message === 'string') return payload.message
  if (typeof payload.error?.message === 'string') return payload.error.message
  return fallback
}
