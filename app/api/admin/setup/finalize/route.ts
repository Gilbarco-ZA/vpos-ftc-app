import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { finalizeAdminSetup } from '@/src/modules/setup/application/finalizeAdminSetup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) =>
    ok(await finalizeAdminSetup(user.stationId)),
})
