import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type TankDeliveryClearStatus =
  | 'pending_clear'
  | 'cleared_on_doms'
  | 'clear_failed'

export type TankDeliveryCheckpointRow = {
  id: string
  station_id: string
  tank_id: string | null
  tg_id: string
  delivery_report_seq_no: string
  tank_delivery_seq_no: string
  pos_id: string | null
  clear_status: TankDeliveryClearStatus
  source: 'doms' | 'local'
  last_event_type: string | null
  payload: unknown
  data: unknown
  first_seen_at: string
  last_event_at: string
}

export async function appendWetstockEvent(input: {
  stationId: string
  tankId?: string | null
  tgId?: string | null
  deliveryReportSeqNo?: string | null
  tankDeliverySeqNo?: string | null
  eventType: string
  source?: 'doms' | 'local'
  payload?: unknown
  data?: unknown
}) {
  return await queryOne(
    `INSERT INTO forecourt_wetstock_events (
       id, station_id, tank_id, tg_id, delivery_report_seq_no, tank_delivery_seq_no,
       event_type, source, payload, data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
     RETURNING id, created_at`,
    [
      uuidv4(),
      input.stationId,
      input.tankId ?? null,
      input.tgId ?? null,
      input.deliveryReportSeqNo ?? null,
      input.tankDeliverySeqNo ?? null,
      input.eventType,
      input.source ?? 'doms',
      JSON.stringify(input.payload ?? {}),
      JSON.stringify(input.data ?? {}),
    ],
  )
}

export async function upsertTankDeliveryCheckpoint(input: {
  stationId: string
  tankId?: string | null
  tgId: string
  deliveryReportSeqNo: string
  tankDeliverySeqNo: string
  posId?: string | null
  clearStatus?: TankDeliveryClearStatus
  source?: 'doms' | 'local'
  lastEventType?: string | null
  payload?: unknown
  data?: unknown
}) {
  return await queryOne(
    `INSERT INTO forecourt_tank_delivery_checkpoints (
       id, station_id, tank_id, tg_id, delivery_report_seq_no, tank_delivery_seq_no,
       pos_id, clear_status, source, last_event_type, payload, data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
     ON CONFLICT (station_id, delivery_report_seq_no, tg_id, tank_delivery_seq_no)
     DO UPDATE SET
       tank_id = COALESCE(EXCLUDED.tank_id, forecourt_tank_delivery_checkpoints.tank_id),
       pos_id = COALESCE(EXCLUDED.pos_id, forecourt_tank_delivery_checkpoints.pos_id),
       clear_status = EXCLUDED.clear_status,
       source = EXCLUDED.source,
       last_event_type = EXCLUDED.last_event_type,
       last_event_at = NOW(),
       payload = EXCLUDED.payload,
       data = EXCLUDED.data
     RETURNING *`,
    [
      uuidv4(),
      input.stationId,
      input.tankId ?? null,
      input.tgId,
      input.deliveryReportSeqNo,
      input.tankDeliverySeqNo,
      input.posId ?? null,
      input.clearStatus ?? 'pending_clear',
      input.source ?? 'doms',
      input.lastEventType ?? null,
      JSON.stringify(input.payload ?? {}),
      JSON.stringify(input.data ?? {}),
    ],
  )
}

export async function markTankDeliveryCheckpointCleared(input: {
  stationId: string
  deliveryReportSeqNo: string
  tankDeliveries: Array<{ tgId: string; tankDeliverySeqNo: string }>
  posId?: string | null
  payload?: unknown
  data?: unknown
}) {
  const updated: TankDeliveryCheckpointRow[] = []
  for (const entry of input.tankDeliveries) {
    const row = await queryOne<TankDeliveryCheckpointRow>(
      `UPDATE forecourt_tank_delivery_checkpoints
          SET clear_status = 'cleared_on_doms',
              pos_id = COALESCE($5, pos_id),
              last_event_type = 'cleared_on_doms',
              last_event_at = NOW(),
              payload = $6::jsonb,
              data = $7::jsonb
        WHERE station_id = $1
          AND delivery_report_seq_no = $2
          AND tg_id = $3
          AND tank_delivery_seq_no = $4
      RETURNING *`,
      [
        input.stationId,
        input.deliveryReportSeqNo,
        entry.tgId,
        entry.tankDeliverySeqNo,
        input.posId ?? null,
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.data ?? {}),
      ],
    )
    if (row) updated.push(row)
  }
  return updated
}

export async function listPendingTankDeliveryCheckpoints(stationId: string) {
  return await queryAll<TankDeliveryCheckpointRow>(
    `SELECT *
       FROM forecourt_tank_delivery_checkpoints
      WHERE station_id = $1 AND clear_status <> 'cleared_on_doms'
      ORDER BY last_event_at DESC, first_seen_at DESC`,
    [stationId],
  )
}
