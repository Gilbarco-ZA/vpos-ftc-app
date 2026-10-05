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
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user, body }) => {
    const result = await syncTankVolumes(user.stationId)
    if (body.publishTanzaniaInventory !== true) return ok(result)

    if (result.capture.available === false || result.capture.snapshotsSaved <= 0) {
      return ok({
        ...result,
        publication: {
          ok: false,
          skipped: true,
          reason: 'atg_unavailable',
        },
      })
    }

    const publication = await publishTanzaniaTankInventoriesForCapture(
      user.stationId,
      result.capture,
    )

    return ok({ ...result, publication })
  },
})
