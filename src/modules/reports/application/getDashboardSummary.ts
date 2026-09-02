import { queryOne } from '@/src/platform/db/postgres'

export async function getDashboardSummary(input: {
  stationId: string
  start: Date
  end: Date
}) {
  const [totals, customerCount] = await Promise.all([
    queryOne<Record<string, any>>(
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
      [input.stationId, input.start, input.end],
    ),
    queryOne<{ customer_count?: number }>(
      `
        SELECT COUNT(DISTINCT cs.customer_id)::int AS customer_count
        FROM customer_stations cs
        JOIN customers c ON c.id = cs.customer_id
        WHERE cs.station_id = $1
          AND c.deleted_at IS NULL
      `,
      [input.stationId],
    ),
  ])

  return {
    range: { start: input.start.toISOString(), end: input.end.toISOString() },
    totals: {
      transactionCount: totals?.transaction_count ?? 0,
      fiscalizedCount: totals?.fiscalized_count ?? 0,
      nonFiscalizedCount: totals?.non_fiscalized_count ?? 0,
      failedCount: totals?.failed_count ?? 0,
      totalAmount: totals?.total_amount ?? 0,
      customerCount: customerCount?.customer_count ?? 0,
    },
  }
}
