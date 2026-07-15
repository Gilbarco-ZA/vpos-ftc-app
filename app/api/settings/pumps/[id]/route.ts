import { notFound, ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getPumpSetting } from '@/src/modules/settings/application/getPumpSetting'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, params }) => {
    const pump = await getPumpSetting(user.stationId, String(params.id ?? ''))
    return pump ? ok(pump) : notFound('Pump not found')
  },
})
