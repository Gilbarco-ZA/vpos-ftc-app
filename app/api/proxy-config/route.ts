import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { readBody } from '@/src/platform/web/api/request'
import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { kvSet } from '@/src/shared/storage/stationKv'

import {
  getProxyConfig,
  proxyConfigStorageKey,
} from '@/src/modules/proxy-settings/application/getProxyConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    return NextResponse.json(await getProxyConfig(user.stationId))
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (req: Request) => {
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

    // expects object of {key:value} like console
    const entries = Object.entries(body || {}).filter(
      ([key]) => key !== 'csrf_token',
    )
    for (const [key, value] of entries) {
      await kvSet(user.stationId, proxyConfigStorageKey(key), value)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
