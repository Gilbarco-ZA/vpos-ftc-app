import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { readVposRestartConfig } from '@/src/modules/vpos/application/getVposRestartConfig'
import { updateVposRestartConfig } from '@/src/modules/vpos/application/setVposRestartConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const data = await readVposRestartConfig({ stationId: user.stationId })
    return ok(data)
  },
})

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    const data = await updateVposRestartConfig({
      stationId: user.stationId,
      body: body || {},
    })
    return ok(data)
  },
})
