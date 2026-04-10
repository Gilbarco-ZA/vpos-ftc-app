import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { sendTankLevelMovement } from '@/src/modules/tank-levels/application/sendTankLevelMovement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  { csrf_token?: string },
  { id: string }
>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const result = await sendTankLevelMovement(
      user.stationId,
      String(params.id || '').trim(),
    )
    return ok(result)
  },
})
