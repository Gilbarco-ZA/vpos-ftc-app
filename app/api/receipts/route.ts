import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import {
  getReceiptRoutePayload,
  listReceiptRouteRows,
} from '@/src/modules/transactions/application/queries/get-receipt-route-data'

export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) return await serverError('User not found')

    const { searchParams } = new URL(req.url)
    const transactionId = (searchParams.get('transactionId') || '').trim()
    const listMode = (searchParams.get('list') || '').trim() === '1'
    const previewMode = (searchParams.get('preview') || '').trim() === '1'

    if (transactionId && !listMode) {
      const result = await getReceiptRoutePayload({
        stationId: user.stationId,
        transactionId,
        previewMode,
        attendantName: user.fullName || user.username || undefined,
      })
      if (!result.found) {
        return NextResponse.json(
          { ok: false, error: result.error, raw: result.raw ?? null },
          { status: 404 },
        )
      }
      return NextResponse.json(result.payload)
    }

    return ok(await listReceiptRouteRows(user.stationId, transactionId))
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
