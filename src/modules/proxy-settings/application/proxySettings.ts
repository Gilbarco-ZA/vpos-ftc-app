import type { ProxyRequestResult } from '@/src/shared/proxy/client'

import { proxyRequest } from '@/src/shared/proxy/client'

export type ProxySettingsConfig = {
  cloudApiBase: string
  swaggerEndpointCloud: string
  swaggerEndpointInternal: string
  healthEndpoint: string
  swaggerCacheTimeout: number
  requestTimeout: number
  rateLimitWindowMs: number
  rateLimitMaxRequests: number
  fiscalNif: string
  fiscalEmissionLogic: number
  fiscalRepositoryId: string
}

export type ProxySettingsResponse = {
  settings: ProxySettingsConfig
  runtimeLastUpdated?: number | null
}

export type ProxySettingsPatch = Partial<ProxySettingsConfig>

const SETTINGS_PATH = '/proxy/health' // '/proxy/settings'

const callProxySettings = async (
  stationId: string | undefined,
  opts: {
    method: 'GET' | 'PATCH' | 'POST'
    path?: string
    body?: any
  },
): Promise<ProxyRequestResult> => {
  try {
    return await proxyRequest(stationId, {
      method: opts.method,
      path: opts.path ?? SETTINGS_PATH,
      fallbackPath: opts.path ?? SETTINGS_PATH,
      body: opts.body,
      timeoutMs: 8_000,
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
      url: SETTINGS_PATH,
    }
  }
}

export const getProxySettingsViaProxy = (stationId: string | undefined) =>
  callProxySettings(stationId, { method: 'GET' })

export const updateProxySettingsViaProxy = (
  stationId: string | undefined,
  patch: ProxySettingsPatch,
) => callProxySettings(stationId, { method: 'PATCH', body: patch })

export const extractProxySettingsPayload = (
  data: any,
): ProxySettingsResponse => {
  if (data?.settings) {
    return {
      settings: data.settings,
      runtimeLastUpdated: data.runtimeLastUpdated ?? null,
    }
  }

  return {
    settings: data,
    runtimeLastUpdated: data?.runtimeLastUpdated ?? null,
  }
}

export const getProxySettingsErrorMessage = (
  data: any,
  fallback = 'vpos-proxy settings request failed',
) => {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message
  if (typeof data.error?.message === 'string') return data.error.message
  return fallback
}
