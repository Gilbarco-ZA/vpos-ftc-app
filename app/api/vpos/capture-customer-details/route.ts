import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { submitVposCustomerDetails } from '@/src/modules/vpos/application/captureVposCustomerDetails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const data = await submitVposCustomerDetails({
      stationId: user.stationId,
      payload: body || {},
    })
    return ok(data)
  },
})
