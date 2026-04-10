import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runPosControlCommand } from '@/src/modules/pos/application/runPosControlCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute({
  roles: ['tenant', 'manager', 'administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    return await runPosControlCommand({
      stationId: user.stationId,
      command: 'preFuelCustomer',
      body,
    })
  },
})
