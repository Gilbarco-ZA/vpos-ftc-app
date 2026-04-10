import { fail, ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { findFiscalInboxByRequestIdQuery } from '@/src/modules/fiscal-inbox/application/queries/find-fiscal-inbox-by-request-id'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const searchParams = new URL(req.url).searchParams
    const requestId = String(searchParams.get('requestId') || '').trim()
    if (!requestId) return fail('requestId is required')

    const stationId =
      String(searchParams.get('stationId') || user.stationId || '').trim() ||
      null

    const items = await findFiscalInboxByRequestIdQuery({
      requestId,
      stationId,
    })
    return ok({
      requestId,
      stationId,
      count: items.length,
      items,
    })
  },
})
