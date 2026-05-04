import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runPosDomsCommand } from '@/src/modules/pos/application/runPosDomsCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['tenant', 'manager', 'administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    return await runPosDomsCommand(user.stationId, 'stopDeliveryProcess', body)
  },
})
