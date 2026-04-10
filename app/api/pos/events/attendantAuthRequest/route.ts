import type { PosPendingAttendantAuthRecordInput } from '@/src/modules/pos/application/posEventTypes'

import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { recordPendingAttendantAuth } from '@/src/modules/pos/application/recordPendingAttendantAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<PosPendingAttendantAuthRecordInput>({
  roles: ['tenant', 'manager', 'administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    const result = await recordPendingAttendantAuth({
      stationId: user.stationId,
      body,
    })
    return result instanceof Response ? result : ok(result)
  },
})
