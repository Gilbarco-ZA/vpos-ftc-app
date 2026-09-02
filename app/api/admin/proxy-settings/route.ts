import type { ProxySettingsPatch } from '@/src/modules/proxy-settings/application/proxySettings'

import { fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  extractProxySettingsPayload,
  getProxySettingsErrorMessage,
  getProxySettingsViaProxy,
  updateProxySettingsViaProxy,
} from '@/src/modules/proxy-settings/application/proxySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_FIELDS = [
  'cloudApiBase',
  'swaggerEndpointCloud',
  'swaggerEndpointInternal',
  'swaggerEndpointTanzania',
  'healthEndpoint',
  'swaggerCacheTimeout',
  'requestTimeout',
  'rateLimitWindowMs',
  'rateLimitMaxRequests',
  'fiscalNif',
  'fiscalEmissionLogic',
  'fiscalRepositoryId',
  'countryCode',
  'queueModules',
] as const

const toPatch = (body: Record<string, unknown>): ProxySettingsPatch => {
  const patch: ProxySettingsPatch = {}
  const scalarPatch = patch as Record<string, unknown>

  for (const field of SETTINGS_FIELDS) {
    const value = body[field]
    if (value === undefined || value === null) continue

    if (field === 'queueModules') {
      if (typeof value === 'object' && !Array.isArray(value)) {
        patch.queueModules = Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(
            ([key, enabled]) => [key, enabled === true],
          ),
        )
      }
      continue
    }

    if (field === 'countryCode') {
      patch.countryCode = String(value).trim().toUpperCase() || null
      continue
    }

    scalarPatch[field] = typeof value === 'string' ? value.trim() : value
  }

  return patch
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const result = await getProxySettingsViaProxy(user.stationId)
    if (!result.ok) {
      return fail(
        getProxySettingsErrorMessage(
          result.data,
          'Unable to load proxy settings',
        ),
        result.status,
      )
    }

    return ok(extractProxySettingsPayload(result.data, result.url))
  },
})

export const PATCH = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await updateProxySettingsViaProxy(
      user.stationId,
      toPatch(body),
    )
    if (!result.ok) {
      return fail(
        getProxySettingsErrorMessage(
          result.data,
          'Unable to update proxy settings',
        ),
        result.status,
      )
    }

    return ok(extractProxySettingsPayload(result.data, result.url))
  },
})
