import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from 'next/server'

import { fail, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import {
  getEwuraItem,
  parseEwuraItemType,
} from '@/src/modules/tanzania-fiscal/application/ewuraRecords'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (
  req: NextRequest,
  props: { params: Promise<{ type: string; id: string }> },
) => {
  const params = await props.params
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    const type = parseEwuraItemType(params.type)
    if (!type) return fail('Invalid EWURA resource type', 400)

    const data = await getEwuraItem({
      stationId: user.stationId,
      type,
      id: params.id,
    })
    return NextResponse.json({ ok: true, data: data ?? null })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
