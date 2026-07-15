import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminProcessSchema } from '@/src/modules/admin-config/application/getAdminProcessSchema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }

    const result = await getAdminProcessSchema({
      stationId: user.stationId,
      name: String((await ctx.params).name),
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
