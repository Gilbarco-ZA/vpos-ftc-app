import type { SessionUser } from '@/src/shared/types'

import { query } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { searchParams } = new URL(req.url)
    const sinceIdRaw = String(searchParams.get('sinceId') || '0')
    const sinceId = Math.max(0, Number.parseInt(sinceIdRaw, 10) || 0)
    const limitRaw = Number.parseInt(
      String(searchParams.get('limit') || '20'),
      10,
    )
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(limitRaw) || 20))

    const rows = await query(
      `
      SELECT id, received_at, message_json
      FROM fiscal_inbox
      WHERE station_id = $1
        AND id > $2
        AND (message_json->>'type') IN (
          'transactionCreated',
          'transactionFailed',
          'transactionFiscalized'
        )
      ORDER BY id ASC
      LIMIT $3
      `,
      [user.stationId, sinceId, limit],
    )

    const items = (rows?.rows ?? []).map((row: any) => {
      const message = row.message_json ?? {}
      return {
        id: Number(row.id),
        receivedAt: row.received_at ? String(row.received_at) : null,
        type: String(message.type || ''),
        transactionId: message.transactionId ?? null,
        pumpNumber: message.pumpNumber ?? null,
        amount: message.amount ?? null,
        error: message.error ?? null,
        reference: message.reference ?? null,
      }
    })

    return ok({ items })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
