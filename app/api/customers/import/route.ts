import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { importCloudCustomer } from '@/src/modules/customers/application/importCloudCustomer'

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const result = await importCloudCustomer({
      stationId: user.stationId,
      userId: user.id,
      body,
    })

    return result instanceof Response ? result : ok(result)
  },
})
