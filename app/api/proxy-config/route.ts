import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { query, queryAll } from '@/src/platform/db/postgres'
import { readBody } from '@/src/platform/web/api/request'
import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PREFIX = 'proxy.'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const rows = await queryAll<any>(
      `SELECT key, value FROM station_kv WHERE station_id = $1 AND key LIKE $2 ORDER BY key`,
      [user.stationId, `${PREFIX}%`],
    )
    const out: Record<string, any> = {}
    for (const r of rows) out[r.key.slice(PREFIX.length)] = r.value
    return NextResponse.json(out)
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
    const entries = Object.entries(body || {})
    for (const [k, v] of entries) {
      await query(
        `
        INSERT INTO station_kv (station_id, key, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (station_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [user.stationId, `${PREFIX}${k}`, v],
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
