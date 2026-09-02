import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { syncTankVolumes } from '@/src/modules/settings/application/syncTankVolumes'
import { publishTanzaniaTankInventoriesForCapture } from '@/src/modules/tanzania-fiscal/application/publishTankInventories'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SyncTankVolumesBody = {
  publishTanzaniaInventory?: boolean
}

export const POST = defineMutationRoute<SyncTankVolumesBody>({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const result = await syncTankVolumes(user.stationId)
    if (body.publishTanzaniaInventory !== true) return ok(result)

    const publication = await publishTanzaniaTankInventoriesForCapture(
      user.stationId,
      result.capture,
    )

    return ok({ ...result, publication })
  },
})
