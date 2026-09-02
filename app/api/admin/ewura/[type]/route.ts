import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from 'next/server'

import { readBody } from '@/src/platform/web/api/request'
import { fail, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import {
  getEwuraResources,
  parseEwuraResourceType,
  saveEwuraResource,
} from '@/src/modules/tanzania-fiscal/application/ewuraRecords'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (
  req: NextRequest,
  props: { params: Promise<{ type: string }> },
) => {
  const params = await props.params
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    const type = parseEwuraResourceType(params.type)
    if (!type) return fail('Invalid EWURA resource type', 400)

    const url = new URL(req.url)
    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1),
      500,
    )
    const data = await getEwuraResources({
      stationId: user.stationId,
      type,
      status: url.searchParams.get('status'),
      limit,
    })
    return NextResponse.json({ ok: true, data: data ?? null })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (
  req: NextRequest,
  props: { params: Promise<{ type: string }> },
) => {
  const params = await props.params
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const type = parseEwuraResourceType(params.type)
    if (!type) return fail('Invalid EWURA resource type', 400)

    const result = await saveEwuraResource({
      stationId: user.stationId,
      type,
      body: await readBody(req),
    })
    if (!result.ok) return fail(result.error, 400)
    return NextResponse.json(result)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
