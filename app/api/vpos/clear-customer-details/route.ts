import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { resetVposCustomerDetails } from '@/src/modules/vpos/application/clearVposCustomerDetails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const data = await resetVposCustomerDetails({ stationId: user.stationId })
    return ok(data)
  },
})
