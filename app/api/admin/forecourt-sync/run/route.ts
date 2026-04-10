import type { RunAdminForecourtSyncBody } from '@/src/modules/forecourt/application/runAdminForecourtSync'

import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runAdminForecourtSync } from '@/src/modules/forecourt/application/runAdminForecourtSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<RunAdminForecourtSyncBody>({
  roles: ['administrator', 'manager'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    return ok(await runAdminForecourtSync(user.stationId, body))
  },
})
