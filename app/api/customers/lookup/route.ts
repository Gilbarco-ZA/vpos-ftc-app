import type { SessionUser } from '@/src/shared/types'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { lookupCustomerByTin } from '@/src/modules/customers/application/lookupCustomerByTin'

export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { searchParams } = new URL(req.url)
    const tin = (searchParams.get('tin') || '').trim().toUpperCase()
    const stationIdParam = (searchParams.get('station_id') || '').trim()
    const stationId =
      stationIdParam && stationIdParam === user.stationId
        ? stationIdParam
        : user.stationId

    if (!tin) return fail('TIN is required', 400)

    const customer = await lookupCustomerByTin({ stationId, tin })

    if (!customer) return ok({ customer: null })

    return ok({ customer })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
