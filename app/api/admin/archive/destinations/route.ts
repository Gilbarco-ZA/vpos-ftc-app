import { NextRequest } from 'next/server'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminArchiveDestinations } from '@/src/modules/archive/application/getAdminArchiveDestinations'
import { getArchiveExportsDeprecatedMessage } from '@/src/modules/archive/application/getArchiveExportsDeprecatedMessage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  try {
    const user = await requireAuth(['administrator', 'manager'])
    return ok(await getAdminArchiveDestinations(user.stationId))
  } catch (err) {
    return await serverError(err, {})
  }
}

export const POST = async (_req: NextRequest) => {
  try {
    await requireAuth(['administrator', 'manager'])
    return fail(getArchiveExportsDeprecatedMessage(), 410)
  } catch (err) {
    return await serverError(err, {})
  }
}
