import type { PosPendingAttendantAuthClearInput } from '@/src/modules/pos/application/posEventTypes'

import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { clearPendingAttendantAuth } from '@/src/modules/pos/application/clearPendingAttendantAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<PosPendingAttendantAuthClearInput>({
  roles: ['tenant', 'manager', 'administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    const result = await clearPendingAttendantAuth({
      stationId: user.stationId,
      body,
    })
    return result instanceof Response ? result : ok(result)
  },
})
