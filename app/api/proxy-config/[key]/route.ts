import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { query, queryOne } from '@/src/platform/db/postgres'
import { readBody } from '@/src/platform/web/api/request'
import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

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
    const row = await queryOne<any>(
      `SELECT value FROM station_kv WHERE station_id = $1 AND key = $2`,
      [user.stationId, `${PREFIX}${params.key}`],
    )
    return NextResponse.json(row?.value ?? null)
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

    await query(
      `
      INSERT INTO station_kv (station_id, key, value)
      VALUES ($1, $2, $3)
      ON CONFLICT (station_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [user.stationId, `${PREFIX}${params.key}`, body?.value ?? body],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
