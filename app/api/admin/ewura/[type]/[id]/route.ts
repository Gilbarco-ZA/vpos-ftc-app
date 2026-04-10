import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from 'next/server'

import { queryOne } from '@/src/platform/db/postgres'
import { fail, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type EwuraType = 'transactions' | 'reports'

const asType = (t: string): EwuraType | null => {
  if (t === 'transactions' || t === 'reports') return t
  return null
}

export const GET = async (
  req: NextRequest,
  { params }: { params: { type: string; id: string } },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    const type = asType(params.type)
    if (!type) return fail('Invalid EWURA resource type', 400)

    const stationId = user?.stationId
    const id = params.id

    if (type === 'transactions') {
      const row = await queryOne<any>(
        `SELECT id, station_id, transaction_id, ewura_reference, status, payload_json, created_at, updated_at
           FROM ewura_transactions
          WHERE station_id = $1 AND id = $2`,
        [stationId, id],
      )
      return NextResponse.json({ ok: true, data: row ?? null })
    }

    const row = await queryOne<any>(
      `SELECT id, station_id, report_date, ewura_reference, status, payload_json, created_at, updated_at
         FROM ewura_reports
        WHERE station_id = $1 AND id = $2`,
      [stationId, id],
    )
    return NextResponse.json({ ok: true, data: row ?? null })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
