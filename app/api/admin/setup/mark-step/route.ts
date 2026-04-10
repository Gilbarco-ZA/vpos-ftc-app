import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { markAdminSetupStep } from '@/src/modules/setup/application/markSetupStep'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute({
  csrf: false,
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    return await markAdminSetupStep(user.stationId, (body as any)?.step)
  },
})
