import type { SessionUser } from '@/src/shared/types'

import { queryAll } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

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

    const params: any[] = [user?.stationId]
    let where = `WHERE station_id = $1`
    if (status) {
      params.push(status)
      where += ` AND status = $${params.length}`
    }

    params.push(limit, offset)

    const rows = await queryAll<any>(
      `
      SELECT
        id, status, source_type, source_path, relative_path, file_name, file_size,
        sha256, error_message, moved_to_path, updated_at
      FROM legacy_import_ledger
      ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    )

    return ok({ rows, limit, offset })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
