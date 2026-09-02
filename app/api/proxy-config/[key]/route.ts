import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { readBody } from '@/src/platform/web/api/request'
import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PREFIX = 'proxy.'

export const GET = async (
  req: Request,
  props: { params: Promise<{ key: string }> },
) => {
  const params = await props.params
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const value = await kvGet<any>(user.stationId, `${PREFIX}${params.key}`)
    return NextResponse.json(value)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const PATCH = async (
  req: Request,
  props: { params: Promise<{ key: string }> },
) => {
  const params = await props.params
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body.csrf_token,
    })

    await kvSet(user.stationId, `${PREFIX}${params.key}`, body?.value ?? body)

    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
