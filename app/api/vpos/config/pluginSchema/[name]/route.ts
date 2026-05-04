import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminPluginSchema } from '@/src/modules/admin-config/application/getAdminPluginSchema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (req: Request, ctx: { params: Promise<{ name: string }> }) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }

    const url = new URL(req.url)
    const processType =
      url.searchParams.get('processType') || url.searchParams.get('process')

    const result = await getAdminPluginSchema({
      stationId: user.stationId,
      name: String((await ctx.params).name),
      processType,
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
