import type { PumpsConfig } from '@/src/modules/setup/application/pumpsConfigTypes'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { saveAdminPumpsConfig } from '@/src/modules/setup/application/saveAdminPumpsConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<PumpsConfig>({
  csrf: false,
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return await saveAdminPumpsConfig(user.stationId, body)
  },
})
