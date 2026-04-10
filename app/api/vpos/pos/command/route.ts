import { fail, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import {
  prepareVposPosCommand,
  sendVposPosCommand,
} from '@/src/modules/vpos/application/sendVposPosCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const prepared = prepareVposPosCommand(body || {})
    if (!prepared.ok) return fail(prepared.error, 400)

    const result = await sendVposPosCommand({
      stationId: user.stationId,
      command: prepared.value,
    })
    return ok(result)
  },
})
