import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getPosDomsCommandResult } from '@/src/modules/pos/application/getPosDomsCommandResult'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user }) => {
    return await getPosDomsCommandResult(
      user.stationId,
      'getPumpGradeBlendTotals',
      req,
    )
  },
})
