import type { SessionUser } from '@/src/shared/types'

import { readBody } from '@/src/platform/web/api/request'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import { runAdminStationSync } from '@/src/modules/sync/application/runStationSync'

export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body.csrf_token,
    })

    const direction =
      body?.direction === 'push' ||
      body?.direction === 'pull' ||
      body?.direction === 'both'
        ? body.direction
        : undefined

    const force = body?.force === true

    const limitPerTable =
      typeof body?.limitPerTable === 'number' &&
      Number.isFinite(body.limitPerTable)
        ? body.limitPerTable
        : undefined

    const result = await runAdminStationSync({
      stationId: user.stationId,
      direction,
      force,
      limitPerTable,
    })

    return ok(result)
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('CSRF')) return fail('CSRF validation failed', 403)
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
