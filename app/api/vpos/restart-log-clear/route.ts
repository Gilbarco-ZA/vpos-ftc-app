import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { clearVposRestartLog } from '@/src/modules/vpos/application/clearVposRestartLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) => {
    const data = await clearVposRestartLog({ stationId: user.stationId })
    return ok(data)
  },
})

export const GET = POST
