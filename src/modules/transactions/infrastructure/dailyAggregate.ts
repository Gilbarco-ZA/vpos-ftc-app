import { query, queryAll } from '@/src/platform/db/postgres'
import { toNumberOr } from '@/src/shared/numbers'
import { kvSet } from '@/src/shared/storage/stationKv'

type Totals = {
  businessDate: string
  count: number
  totalAmount: number
  totalVolume: number
  byFuelType: Record<
    string,
    { count: number; totalAmount: number; totalVolume: number }
  >
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const asNumber = (v: any) => toNumberOr(v, 0)

/**
 * Aggregates transactions by business date.
 */

export async function computeDailyTotals(
  stationId: string,
  businessDate?: string,
): Promise<Totals> {
  const day = businessDate ?? isoDate(new Date())

  const rows = await queryAll<any>(
    `
    SELECT total_amount, volume, fuel_type
    FROM transactions
    WHERE station_id = $1
      AND status IN ('FISCALIZED','COMPLETED')
      AND transaction_date_time >= ($2::date)
      AND transaction_date_time <  (($2::date) + interval '1 day')
    `,
    [stationId, day],
  )

  const totals: Totals = {
    businessDate: day,
    count: 0,
    totalAmount: 0,
    totalVolume: 0,
    byFuelType: Object.create(null),
  }

  for (const r of rows) {
    const amt = asNumber(r.total_amount)
    const vol = r.volume == null ? 0 : asNumber(r.volume)
    const fuel = String(r.fuel_type ?? 'UNKNOWN')

    totals.count += 1
    totals.totalAmount += amt
    totals.totalVolume += vol

    if (!totals.byFuelType[fuel]) {
      totals.byFuelType[fuel] = { count: 0, totalAmount: 0, totalVolume: 0 }
    }
    totals.byFuelType[fuel].count += 1
    totals.byFuelType[fuel].totalAmount += amt
    totals.byFuelType[fuel].totalVolume += vol
  }

  return totals
}

export async function persistDailyTotals(stationId: string, totals: Totals) {
  // KV for fast UI reads
  await kvSet(stationId, 'vpos.runtime.daily', totals)

  await query(
    `
    INSERT INTO station_daily_totals (station_id, business_date, totals_json, computed_at)
    VALUES ($1, $2::date, $3, NOW())
    ON CONFLICT (station_id, business_date)
    DO UPDATE SET totals_json = EXCLUDED.totals_json, computed_at = NOW()
    `,
    [stationId, totals.businessDate, totals],
  )
}

export async function recomputeAndPersistDailyTotals(
  stationId: string,
  businessDate?: string,
) {
  const totals = await computeDailyTotals(stationId, businessDate)
  await persistDailyTotals(stationId, totals)
  return totals
}
