import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getStationStatus } from '@/src/modules/status/application/getStationStatus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager', 'tenant'])
    if (!user) {
      return await serverError('User not found')
    }
    const result = await getStationStatus(user.stationId)
    return NextResponse.json(result)
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
