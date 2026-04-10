import { query, queryAll } from '@/src/platform/db/postgres'

export type ForecourtPendingPriceSetRow = {
  station_id: string
  price_set_id: number
  activation_at: string
  source: string
  is_confirmed_on_doms: boolean
  data: any
  created_at: string
  updated_at: string
}

export async function upsertPendingForecourtPriceSet(params: {
  stationId: string
  priceSetId: number
  activationAt: string
  source?: string
  isConfirmedOnDoms?: boolean
  data?: any
}) {
  await query(
    `INSERT INTO forecourt_pending_price_sets
       (station_id, price_set_id, activation_at, source, is_confirmed_on_doms, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (station_id, price_set_id, activation_at)
     DO UPDATE SET source = CASE
                              WHEN forecourt_pending_price_sets.is_confirmed_on_doms = TRUE THEN forecourt_pending_price_sets.source
                              ELSE EXCLUDED.source
                            END,
                   is_confirmed_on_doms = forecourt_pending_price_sets.is_confirmed_on_doms OR EXCLUDED.is_confirmed_on_doms,
                   data = CASE
                            WHEN EXCLUDED.data IS NULL OR EXCLUDED.data = '{}'::jsonb THEN forecourt_pending_price_sets.data
                            ELSE forecourt_pending_price_sets.data || EXCLUDED.data
                          END,
                   updated_at = NOW()`,
    [
      params.stationId,
      params.priceSetId,
      params.activationAt,
      params.source ?? 'local',
      params.isConfirmedOnDoms ?? false,
      params.data ?? {},
    ],
  )
}

export async function listPendingForecourtPriceSets(stationId: string) {
  return await queryAll<ForecourtPendingPriceSetRow>(
    `SELECT station_id,
            price_set_id,
            activation_at::text AS activation_at,
            source,
            is_confirmed_on_doms,
            data,
            created_at::text AS created_at,
            updated_at::text AS updated_at
       FROM forecourt_pending_price_sets
      WHERE station_id = $1
      ORDER BY activation_at ASC, price_set_id ASC`,
    [stationId],
  )
}

export async function deleteActivatedPendingForecourtPriceSets(params: {
  stationId: string
  priceSetId?: number | null
  activeAt?: string | null
}) {
  if (!params.activeAt) return
  if (params.priceSetId != null) {
    await query(
      `DELETE FROM forecourt_pending_price_sets
        WHERE station_id = $1
          AND price_set_id = $2
          AND activation_at <= $3`,
      [params.stationId, params.priceSetId, params.activeAt],
    )
    return
  }

  await query(
    `DELETE FROM forecourt_pending_price_sets
      WHERE station_id = $1
        AND activation_at <= $2`,
    [params.stationId, params.activeAt],
  )
}
