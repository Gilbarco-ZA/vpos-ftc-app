import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

export type ForecourtPendingPriceSetStatus =
  | 'submitted_local'
  | 'verification_unavailable'
  | 'confirmed_on_doms'

export type ForecourtPendingPriceSetRow = {
  station_id: string
  price_set_id: number
  activation_at: string
  source: string
  status: ForecourtPendingPriceSetStatus
  is_confirmed_on_doms: boolean
  data: any
  last_event_type: string | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

const mapPendingStatus = (
  value: unknown,
  isConfirmedOnDoms: boolean,
): ForecourtPendingPriceSetStatus => {
  const text = String(value ?? '').trim()
  if (text === 'confirmed_on_doms') return 'confirmed_on_doms'
  if (text === 'verification_unavailable') return 'verification_unavailable'
  if (isConfirmedOnDoms) return 'confirmed_on_doms'
  return 'submitted_local'
}

export async function getPendingForecourtPriceSet(params: {
  stationId: string
  priceSetId: number
  activationAt: string
}) {
  const row = await queryOne<ForecourtPendingPriceSetRow>(
    `SELECT station_id,
            price_set_id,
            activation_at::text AS activation_at,
            source,
            status,
            is_confirmed_on_doms,
            data,
            last_event_type,
            last_event_at::text AS last_event_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
       FROM forecourt_pending_price_sets
      WHERE station_id = $1
        AND price_set_id = $2
        AND activation_at = $3`,
    [params.stationId, params.priceSetId, params.activationAt],
  )

  if (!row) return null
  return {
    ...row,
    status: mapPendingStatus(row.status, Boolean(row.is_confirmed_on_doms)),
  }
}

export async function upsertPendingForecourtPriceSet(params: {
  stationId: string
  priceSetId: number
  activationAt: string
  source?: string
  status?: ForecourtPendingPriceSetStatus
  isConfirmedOnDoms?: boolean
  data?: any
  lastEventType?: string | null
  lastEventAt?: string | null
}) {
  const status = mapPendingStatus(
    params.status,
    Boolean(params.isConfirmedOnDoms),
  )

  await query(
    `INSERT INTO forecourt_pending_price_sets
       (
         station_id,
         price_set_id,
         activation_at,
         source,
         status,
         is_confirmed_on_doms,
         data,
         last_event_type,
         last_event_at,
         updated_at
       )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, NOW()),NOW())
     ON CONFLICT (station_id, price_set_id, activation_at)
     DO UPDATE SET source = CASE
                              WHEN EXCLUDED.is_confirmed_on_doms = TRUE OR EXCLUDED.status = 'confirmed_on_doms' THEN EXCLUDED.source
                              WHEN forecourt_pending_price_sets.is_confirmed_on_doms = TRUE THEN forecourt_pending_price_sets.source
                              ELSE EXCLUDED.source
                            END,
                   status = CASE
                              WHEN forecourt_pending_price_sets.is_confirmed_on_doms = TRUE
                                   AND EXCLUDED.is_confirmed_on_doms = FALSE
                                   AND EXCLUDED.status <> 'confirmed_on_doms'
                                THEN forecourt_pending_price_sets.status
                              WHEN EXCLUDED.is_confirmed_on_doms = TRUE OR EXCLUDED.status = 'confirmed_on_doms'
                                THEN 'confirmed_on_doms'
                              ELSE COALESCE(EXCLUDED.status, forecourt_pending_price_sets.status)
                            END,
                   is_confirmed_on_doms = forecourt_pending_price_sets.is_confirmed_on_doms OR EXCLUDED.is_confirmed_on_doms,
                   data = CASE
                            WHEN EXCLUDED.data IS NULL OR EXCLUDED.data = '{}'::jsonb THEN forecourt_pending_price_sets.data
                            ELSE forecourt_pending_price_sets.data || EXCLUDED.data
                          END,
                   last_event_type = COALESCE(EXCLUDED.last_event_type, forecourt_pending_price_sets.last_event_type),
                   last_event_at = COALESCE(EXCLUDED.last_event_at, forecourt_pending_price_sets.last_event_at, NOW()),
                   updated_at = NOW()`,
    [
      params.stationId,
      params.priceSetId,
      params.activationAt,
      params.source ?? 'local',
      status,
      params.isConfirmedOnDoms ?? false,
      params.data ?? {},
      params.lastEventType ?? null,
      params.lastEventAt ?? null,
    ],
  )
}

export async function listPendingForecourtPriceSets(stationId: string) {
  const rows = await queryAll<ForecourtPendingPriceSetRow>(
    `SELECT station_id,
            price_set_id,
            activation_at::text AS activation_at,
            source,
            status,
            is_confirmed_on_doms,
            data,
            last_event_type,
            last_event_at::text AS last_event_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
       FROM forecourt_pending_price_sets
      WHERE station_id = $1
      ORDER BY activation_at ASC, price_set_id ASC`,
    [stationId],
  )

  return rows.map((row) => ({
    ...row,
    status: mapPendingStatus(row.status, Boolean(row.is_confirmed_on_doms)),
  }))
}

export async function deleteActivatedPendingForecourtPriceSets(params: {
  stationId: string
  priceSetId?: number | null
  activeAt?: string | null
}) {
  if (!params.activeAt) return []

  if (params.priceSetId != null) {
    return await queryAll<ForecourtPendingPriceSetRow>(
      `DELETE FROM forecourt_pending_price_sets
        WHERE station_id = $1
          AND price_set_id = $2
          AND activation_at <= $3
      RETURNING station_id,
                price_set_id,
                activation_at::text AS activation_at,
                source,
                status,
                is_confirmed_on_doms,
                data,
                last_event_type,
                last_event_at::text AS last_event_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at`,
      [params.stationId, params.priceSetId, params.activeAt],
    )
  }

  return await queryAll<ForecourtPendingPriceSetRow>(
    `DELETE FROM forecourt_pending_price_sets
      WHERE station_id = $1
        AND activation_at <= $2
    RETURNING station_id,
              price_set_id,
              activation_at::text AS activation_at,
              source,
              status,
              is_confirmed_on_doms,
              data,
              last_event_type,
              last_event_at::text AS last_event_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at`,
    [params.stationId, params.activeAt],
  )
}

export async function deletePendingForecourtPriceSet(params: {
  stationId: string
  priceSetId: number
  activationAt: string
}) {
  const row = await queryOne<ForecourtPendingPriceSetRow>(
    `DELETE FROM forecourt_pending_price_sets
      WHERE station_id = $1
        AND price_set_id = $2
        AND activation_at = $3
    RETURNING station_id,
              price_set_id,
              activation_at::text AS activation_at,
              source,
              status,
              is_confirmed_on_doms,
              data,
              last_event_type,
              last_event_at::text AS last_event_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at`,
    [params.stationId, params.priceSetId, params.activationAt],
  )

  if (!row) return null
  return {
    ...row,
    status: mapPendingStatus(row.status, Boolean(row.is_confirmed_on_doms)),
  }
}
