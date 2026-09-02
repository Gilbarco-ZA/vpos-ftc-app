import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getLegacyImportStatus } from '@/src/modules/legacy-import/application/getLegacyImportStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])

    return ok(await getLegacyImportStatus(user.stationId))
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
