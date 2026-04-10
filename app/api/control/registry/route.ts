import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getControlRegistry } from '@/src/modules/control/application/getControlRegistry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async () => {
    return await getControlRegistry()
  },
})
