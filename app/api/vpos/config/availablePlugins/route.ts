import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminAvailablePlugins } from '@/src/modules/admin-config/application/getAdminAvailablePlugins'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const result = await getAdminAvailablePlugins(user.stationId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
