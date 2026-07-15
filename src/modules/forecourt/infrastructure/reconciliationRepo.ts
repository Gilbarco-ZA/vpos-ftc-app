import { queryAll, queryOne } from '@/src/platform/db/postgres'

export type ReconciliationPumpRow = {
  id: string
  station_id: string
  code: string
  name: string
  status: string
  pump_number: number
  doms_fp_id: number | null
  doms_device_sub_address: number | null
  doms_pss_port_no: number | null
  doms_endpoint_host: string | null
  doms_endpoint_port: number | null
  doms_last_seen_at: string | null
  nozzle_count: number
}

export type ReconciliationNozzleRow = {
  id: string
  station_id: string
  pump_id: string
  pump_number: number
  pump_code: string
  pump_name: string
  doms_fp_id: number | null
  nozzle_number: number
  doms_grade_option_id: number | null
  doms_grade_id: string | null
  doms_tank_id: string | null
  tank_id: string | null
  tank_code: string | null
  tank_name: string | null
  product_code: string | null
  product_name: string | null
  doms_last_seen_at: string | null
}

export type ReconciliationTankRow = {
  id: string
  station_id: string
  code: string
  name: string
  status: string
  doms_tank_id: string | null
  product_code: string | null
  product_name: string | null
  capacity_litres: string | null
  live_volume_litres: string | null
  live_volume_updated_at: string | null
  last_tg_payload: any
}

export type ReconciliationEventRow = {
  id: string
  station_id: string
  source: string
  event_type: string
  payload: any
  occurred_at: string
  received_at: string
}

export type ReconciliationForecourtStateRow = {
  station_id: string
  fp_id: number
  status: string | null
  last_event_type: string | null
  data: any
  updated_at: string
}

export async function listConfiguredPumpsForReconciliation(stationId: string) {
  return await queryAll<ReconciliationPumpRow>(
    `SELECT p.id,
            p.station_id,
            p.code,
            p.name,
            p.status,
            p.pump_number,
            p.doms_fp_id,
            p.doms_device_sub_address,
            p.doms_pss_port_no,
            p.doms_endpoint_host,
            p.doms_endpoint_port,
            p.doms_last_seen_at::text AS doms_last_seen_at,
            COUNT(n.id)::int AS nozzle_count
       FROM pumps p
       LEFT JOIN nozzles n ON n.pump_id = p.id AND n.station_id = p.station_id
      WHERE p.station_id = $1
      GROUP BY p.id
      ORDER BY COALESCE(p.doms_fp_id, p.pump_number), p.pump_number`,
    [stationId],
  )
}

export async function listConfiguredNozzlesForReconciliation(
  stationId: string,
) {
  return await queryAll<ReconciliationNozzleRow>(
    `SELECT n.id,
            n.station_id,
            n.pump_id,
            p.pump_number,
            p.code AS pump_code,
            p.name AS pump_name,
            p.doms_fp_id,
            n.nozzle_number,
            n.doms_grade_option_id,
            n.doms_grade_id,
            n.doms_tank_id,
            n.tank_id,
            t.code AS tank_code,
            t.name AS tank_name,
            pr.product_code,
            pr.product_name,
            n.doms_last_seen_at::text AS doms_last_seen_at
       FROM nozzles n
       INNER JOIN pumps p ON p.id = n.pump_id AND p.station_id = n.station_id
       LEFT JOIN tanks t ON t.id = n.tank_id AND t.station_id = n.station_id
       LEFT JOIN products pr ON pr.id = t.product_id AND pr.station_id = n.station_id
      WHERE n.station_id = $1
      ORDER BY COALESCE(p.doms_fp_id, p.pump_number), n.nozzle_number`,
    [stationId],
  )
}

export async function listConfiguredTanksForReconciliation(stationId: string) {
  return await queryAll<ReconciliationTankRow>(
    `SELECT t.id,
            t.station_id,
            t.code,
            t.name,
            t.status,
            t.doms_tank_id,
            pr.product_code,
            pr.product_name,
            t.capacity_litres::text AS capacity_litres,
            t.live_volume_litres::text AS live_volume_litres,
            t.live_volume_updated_at::text AS live_volume_updated_at,
            t.last_tg_payload
       FROM tanks t
       LEFT JOIN products pr ON pr.id = t.product_id AND pr.station_id = t.station_id
      WHERE t.station_id = $1
      ORDER BY COALESCE(NULLIF(t.doms_tank_id, ''), t.code), t.name`,
    [stationId],
  )
}

export async function getLatestFcInstallStatusForReconciliation(
  stationId: string,
) {
  return await queryOne<ReconciliationEventRow>(
    `SELECT id,
            station_id,
            source,
            event_type,
            payload,
            occurred_at::text AS occurred_at,
            received_at::text AS received_at
       FROM forecourt_events
      WHERE station_id = $1
        AND event_type ILIKE 'FcInstallStatus_resp%'
      ORDER BY occurred_at DESC, received_at DESC
      LIMIT 1`,
    [stationId],
  )
}

export async function listForecourtStatesForReconciliation(stationId: string) {
  return await queryAll<ReconciliationForecourtStateRow>(
    `SELECT station_id,
            fp_id,
            status,
            last_event_type,
            data,
            updated_at::text AS updated_at
       FROM forecourt_state
      WHERE station_id = $1
      ORDER BY fp_id ASC`,
    [stationId],
  )
}

export async function listRecentJplEventsForReconciliation(params: {
  stationId: string
  patterns: string[]
  limit: number
}) {
  const patterns = params.patterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
  if (!patterns.length) return []

  const clauses = patterns.map((_, index) => `event_type ILIKE $${index + 2}`)
  return await queryAll<ReconciliationEventRow>(
    `SELECT id,
            station_id,
            source,
            event_type,
            payload,
            occurred_at::text AS occurred_at,
            received_at::text AS received_at
       FROM forecourt_events
      WHERE station_id = $1
        AND (${clauses.join(' OR ')})
      ORDER BY occurred_at DESC, received_at DESC
      LIMIT $${patterns.length + 2}`,
    [
      params.stationId,
      ...patterns,
      Math.max(1, Math.min(200, Math.trunc(params.limit))),
    ],
  )
}
