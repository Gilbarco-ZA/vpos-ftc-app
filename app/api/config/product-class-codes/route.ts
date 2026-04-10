import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { listProductClassCodes } from '@/src/modules/products/application/queries/list-product-class-codes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager', 'tenant'])
    const country = String(user.station?.country || '').toUpperCase()
    const data = await listProductClassCodes({ country })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
