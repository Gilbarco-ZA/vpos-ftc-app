import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminStatusPayload } from '@/src/modules/admin-diagnostics/application/getAdminStatusPayload'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const result = await getAdminStatusPayload(user.stationId)
    return NextResponse.json(result)
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
