import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { searchCustomers } from '@/src/modules/customers/application/searchCustomers'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const result = await searchCustomers({
      stationId: user.stationId,
      query: searchParams.get('query') || '',
    })
    return result instanceof Response ? result : ok(result)
  },
})
