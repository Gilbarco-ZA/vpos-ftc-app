import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { getProductTypeCodes } from '@/src/shared/server/config/getConfig'
import { seedCountryConfigOnce } from '@/src/shared/server/config/seedCountryConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager', 'tenant'])
    const country = String(user.station?.country || '').toUpperCase()
    if (country === 'KE' || country === 'TZ') {
      await seedCountryConfigOnce(country as 'KE' | 'TZ')
    }
    const data = await getProductTypeCodes()
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
