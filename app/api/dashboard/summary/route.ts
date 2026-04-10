import type { SessionUser } from '@/src/shared/types'

import { queryOne } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { parseConsoleRange } from '@/src/shared/console/range'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { start, end } = parseConsoleRange(req.url)

    const totals = await queryOne<any>(
      `
      SELECT
        COUNT(*)::int AS transaction_count,
        COUNT(*) FILTER (WHERE fiscalized_at IS NOT NULL)::int AS fiscalized_count,
        COUNT(*) FILTER (WHERE fiscalized_at IS NULL)::int AS non_fiscalized_count,
        COUNT(*) FILTER (
          WHERE (last_error IS NOT NULL AND last_error <> '')
             OR status ILIKE 'FAILED'
             OR status ILIKE 'ERROR'
        )::int AS failed_count,
        COALESCE(SUM(total_amount), 0)::float AS total_amount
      FROM transactions
      WHERE station_id = $1
        AND deleted_at IS NULL
        AND transaction_date_time >= $2
        AND transaction_date_time <= $3
      `,
      [user.stationId, start, end],
    )
    const customerCount = await queryOne<any>(
      `
      SELECT COUNT(DISTINCT cs.customer_id)::int AS customer_count
      FROM customer_stations cs
      JOIN customers c ON c.id = cs.customer_id
      WHERE cs.station_id = $1
        AND c.deleted_at IS NULL
      `,
      [user.stationId],
    )
    return ok({
      range: { start: start.toISOString(), end: end.toISOString() },
      totals: {
        transactionCount: totals?.transaction_count ?? 0,
        fiscalizedCount: totals?.fiscalized_count ?? 0,
        nonFiscalizedCount: totals?.non_fiscalized_count ?? 0,
        failedCount: totals?.failed_count ?? 0,
        totalAmount: totals?.total_amount ?? 0,
        customerCount: customerCount?.customer_count ?? 0,
      },
    })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
