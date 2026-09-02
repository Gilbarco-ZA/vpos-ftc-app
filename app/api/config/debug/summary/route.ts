import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getCountryConfigDebugSummary } from '@/src/modules/admin-config/application/getCountryConfigDebugSummary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const countryCode = String(user.station?.country || '')
      .trim()
      .toUpperCase()
    return NextResponse.json({
      ok: true,
      data: await getCountryConfigDebugSummary(countryCode),
    })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
