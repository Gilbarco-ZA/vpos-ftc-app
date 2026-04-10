import { query, queryOne } from '@/src/platform/db/postgres'

type DayTotals = {
  stationId: string
  businessDate: string // YYYY-MM-DD
  txCount: number
  totalAmount: string // keep numeric as string from pg
  totalVolume: string
  totalsJson: any
  computedAt: string
}

function asDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

/**
 * Recompute a single business date and upsert into station_daily_totals.
 * Assumes transactions.transaction_date_time is already normalized enough for DATE() grouping.
 * If want station-timezone business day, do timezone conversion before calling.
 */
export async function recomputeDailyTotalsForDate(
  stationId: string,
  businessDate: string, // YYYY-MM-DD
): Promise<DayTotals> {
  // Aggregate transactions for that day.
  // Adjust WHERE status list if only want fiscalized/completed.
  const agg = await queryOne<{
    tx_count: number
    total_amount: string
    total_volume: string
    by_fuel: any
  }>(
    `
		WITH day_tx AS (
			SELECT *
			FROM transactions
			WHERE station_id = $1
			  AND DATE(transaction_date_time) = $2::date
		),
		by_fuel AS (
			SELECT
				COALESCE(fuel_type, 'UNKNOWN') AS fuel_type,
				COUNT(*)::int AS tx_count,
				COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount,
				COALESCE(SUM(volume), 0)::numeric(14,3) AS total_volume
			FROM day_tx
			GROUP BY 1
		)
		SELECT
			(SELECT COUNT(*)::int FROM day_tx) AS tx_count,
			(SELECT COALESCE(SUM(total_amount), 0)::numeric(14,2) FROM day_tx) AS total_amount,
			(SELECT COALESCE(SUM(volume), 0)::numeric(14,3) FROM day_tx) AS total_volume,
			(SELECT COALESCE(jsonb_object_agg(fuel_type, jsonb_build_object(
				'txCount', tx_count,
				'totalAmount', total_amount,
				'totalVolume', total_volume
			)), '{}'::jsonb) FROM by_fuel) AS by_fuel
	`,
    [stationId, businessDate],
  )

  const txCount = agg?.tx_count ?? 0
  const totalAmount = agg?.total_amount ?? '0'
  const totalVolume = agg?.total_volume ?? '0'
  const totalsJson = {
    byFuelType: agg?.by_fuel ?? {},
    // room for growth (add report totals, payment splits, etc)
    version: 1,
  }

  await query(
    `
		INSERT INTO station_daily_totals (
			station_id, business_date, tx_count, total_amount, total_volume, totals_json, computed_at
		)
		VALUES ($1, $2::date, $3, $4::numeric, $5::numeric, $6::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (station_id, business_date)
		DO UPDATE SET
			tx_count = EXCLUDED.tx_count,
			total_amount = EXCLUDED.total_amount,
			total_volume = EXCLUDED.total_volume,
			totals_json = EXCLUDED.totals_json,
			computed_at = CURRENT_TIMESTAMP
		`,
    [stationId, businessDate, txCount, totalAmount, totalVolume, totalsJson],
  )

  const row = await queryOne<{
    station_id: string
    business_date: string
    tx_count: number
    total_amount: string
    total_volume: string
    totals_json: any
    computed_at: string
  }>(
    `
		SELECT
			station_id,
			business_date::text AS business_date,
			tx_count,
			total_amount::text AS total_amount,
			total_volume::text AS total_volume,
			totals_json,
			computed_at::text AS computed_at
		FROM station_daily_totals
		WHERE station_id = $1 AND business_date = $2::date
	`,
    [stationId, businessDate],
  )

  if (!row) {
    throw new Error(
      `station_daily_totals row missing after upsert (stationId=${stationId}, businessDate=${businessDate})`,
    )
  }

  return {
    stationId: row.station_id,
    businessDate: row!.business_date,
    txCount: row!.tx_count,
    totalAmount: row!.total_amount,
    totalVolume: row!.total_volume,
    totalsJson: row!.totals_json,
    computedAt: row!.computed_at,
  }
}

/**
 * Recompute inclusive range.
 */
export async function recomputeDailyTotalsRange(
  stationId: string,
  from: string, // YYYY-MM-DD
  to: string, // YYYY-MM-DD
) {
  const start = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  const out: DayTotals[] = []

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(await recomputeDailyTotalsForDate(stationId, asDateOnly(d)))
  }
  return out
}

/**
 * Convenience: recompute from DB min/max transaction date for the station.
 * Use after legacy import.
 */
export async function recomputeDailyTotalsFromDbBounds(stationId: string) {
  const bounds = await queryOne<{ min_d: string | null; max_d: string | null }>(
    `
		SELECT
			MIN(DATE(transaction_date_time))::text AS min_d,
			MAX(DATE(transaction_date_time))::text AS max_d
		FROM transactions
		WHERE station_id = $1
	`,
    [stationId],
  )

  if (!bounds?.min_d || !bounds?.max_d) return []
  return await recomputeDailyTotalsRange(stationId, bounds.min_d, bounds.max_d)
}

/**
 * Read back totals for UI.
 */
export async function getDailyTotals(
  stationId: string,
  businessDate?: string,
  opts?: { recompute?: boolean; maxAgeSeconds?: number },
) {
  const date = businessDate ?? new Date().toISOString().slice(0, 10)
  const recompute = opts?.recompute ?? false
  const maxAgeSeconds = opts?.maxAgeSeconds ?? 60

  const existing = await queryOne<{
    computed_at: string
  }>(
    `
		SELECT computed_at::text AS computed_at
		FROM station_daily_totals
		WHERE station_id = $1 AND business_date = $2::date
	`,
    [stationId, date],
  )

  let shouldRecompute = recompute || !existing?.computed_at
  if (!shouldRecompute && existing?.computed_at) {
    const ageMs = Date.now() - new Date(existing.computed_at).getTime()
    shouldRecompute = ageMs > maxAgeSeconds * 1000
  }

  if (shouldRecompute) {
    await recomputeDailyTotalsForDate(stationId, date)
  }

  return await queryOne<any>(
    `
		SELECT
			business_date::text AS business_date,
			tx_count,
			total_amount::text AS total_amount,
			total_volume::text AS total_volume,
			totals_json,
			computed_at::text AS computed_at
		FROM station_daily_totals
		WHERE station_id = $1 AND business_date = $2::date
	`,
    [stationId, date],
  )
}
