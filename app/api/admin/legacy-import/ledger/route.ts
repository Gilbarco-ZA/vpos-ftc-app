import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { listLegacyImportLedger } from '@/src/modules/legacy-import/application/listLegacyImportLedger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') // imported | skipped | failed | null
    const limit = Math.min(
      200,
      Math.max(1, Number(searchParams.get('limit') ?? 50)),
    )
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0))

    const rows = await listLegacyImportLedger({
      stationId: user.stationId,
      status,
      limit,
      offset,
    })

    return ok({ rows, limit, offset })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
