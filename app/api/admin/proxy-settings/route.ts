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
  'healthEndpoint',
  'swaggerCacheTimeout',
  'requestTimeout',
  'rateLimitWindowMs',
  'rateLimitMaxRequests',
  'fiscalNif',
  'fiscalEmissionLogic',
  'fiscalRepositoryId',
] as const

const toPatch = (body: Record<string, any>): ProxySettingsPatch => {
  const patch: Record<string, any> = {}
  for (const field of SETTINGS_FIELDS) {
    const value = body[field]
    if (value !== undefined && value !== null) {
      patch[field] = typeof value === 'string' ? value.trim() : value
    }
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

    return ok(extractProxySettingsPayload(result.data))
  },
})

export const PATCH = defineMutationRoute<Record<string, any>>({
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

    return ok(extractProxySettingsPayload(result.data))
  },
})
