import { fail, ok } from '@/src/platform/web/api/response'
import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'
import { setSiteCountry } from '@/src/shared/setup/siteProfile'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { syncSetupSiteProfile } from '@/src/modules/setup/application/syncSetupSiteProfile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  csrf_token?: string
  action?: 'sync' | 'set-country'
  country?: string
}

export const POST = definePublicMutationRoute<Body>({
  handler: async (_req, { body }) => {
    const { stationId } = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })

    if (body?.action === 'set-country') {
      const country = String(body?.country || '').trim()
      if (!country) return fail('Country is required', 400)
      return ok(await setSiteCountry(stationId, country))
    }

    const result = await syncSetupSiteProfile(stationId)
    if (!result.ok) {
      return fail(result.error || 'Site sync failed', 502)
    }
    return ok(result)
  },
})
