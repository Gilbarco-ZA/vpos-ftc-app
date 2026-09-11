import type { PoolClient } from '@/src/platform/db/postgres'

import { queryAll, queryOne, txQuery } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type PreFuelCustomerAllocation = {
  id: string
  station_id: string
  pump_number: number
  nozzle_id: string | null
  nozzle_number: number
  display_number?: number | null
  customer_id: string
  allocated_by: string | null
  status: 'PENDING' | 'CONSUMED' | 'CANCELLED'
  transaction_id: string | null
  created_at: string
  buyer_name?: string | null
  tin?: string | null
}

export async function getTinCaptureOrderRepo(stationId: string) {
  const row = await queryOne<{ tin_capture_order: string | null }>(
    `SELECT tin_capture_order FROM station_settings WHERE station_id = $1::uuid LIMIT 1`,
    [stationId],
  )
  return row?.tin_capture_order === 'before_transaction'
    ? 'before_transaction'
    : 'after_transaction'
}

export async function createPreFuelCustomerAllocation(input: {
  stationId: string
  pumpNumber: number
  nozzleId?: string | null
  nozzleNumber: number
  customerId: string
  allocatedBy?: string | null
}) {
  return await queryOne<PreFuelCustomerAllocation>(
    `INSERT INTO pre_fuel_customer_allocations (
       id, station_id, pump_number, nozzle_id, nozzle_number, customer_id, allocated_by, status
     )
     SELECT $1, $2::uuid, $3::int, n.id, $4::int, c.id, $5::uuid, 'PENDING'
       FROM nozzles n
       JOIN pumps p ON p.id = n.pump_id AND p.station_id = n.station_id
       JOIN customers c ON c.station_id = n.station_id AND c.id = $6::uuid
      WHERE n.station_id = $2::uuid
        AND p.pump_number = $3::int
        AND n.nozzle_number = $4::int
        AND n.is_active = TRUE
        AND p.status <> 'INACTIVE'
        AND ($7::uuid IS NULL OR n.id = $7::uuid)
     ON CONFLICT (station_id, pump_number, nozzle_number)
       WHERE status = 'PENDING'
     DO UPDATE SET customer_id = EXCLUDED.customer_id,
                   nozzle_id = EXCLUDED.nozzle_id,
                   allocated_by = EXCLUDED.allocated_by,
                   created_at = NOW(),
                   cancelled_at = NULL,
                   updated_at = NOW()
     RETURNING *`,
    [
      uuidv4(),
      input.stationId,
      input.pumpNumber,
      input.nozzleNumber,
      input.allocatedBy ?? null,
      input.customerId,
      input.nozzleId ?? null,
    ],
  )
}

export async function getPendingPreFuelCustomerAllocation(input: {
  stationId: string
  allocationId: string
}) {
  return await queryOne<PreFuelCustomerAllocation>(
    `SELECT a.*, COALESCE(n.display_number, a.nozzle_number) AS display_number,
            c.buyer_name, c.tin
       FROM pre_fuel_customer_allocations a
       JOIN customers c ON c.id = a.customer_id AND c.station_id = a.station_id
  LEFT JOIN nozzles n ON n.id = a.nozzle_id AND n.station_id = a.station_id
      WHERE a.station_id = $1::uuid
        AND a.id = $2::uuid
        AND a.status = 'PENDING'
      LIMIT 1`,
    [input.stationId, input.allocationId],
  )
}

export async function cancelPreFuelCustomerAllocation(input: {
  stationId: string
  allocationId: string
}) {
  return await queryOne<PreFuelCustomerAllocation>(
    `UPDATE pre_fuel_customer_allocations
        SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
      WHERE station_id = $1::uuid AND id = $2::uuid AND status = 'PENDING'
    RETURNING *`,
    [input.stationId, input.allocationId],
  )
}

export async function listPendingPreFuelCustomerAllocations(stationId: string) {
  return await queryAll<PreFuelCustomerAllocation>(
    `WITH expired AS (
       UPDATE pre_fuel_customer_allocations a
          SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
         FROM station_settings ss
        WHERE ss.station_id = a.station_id
          AND a.station_id = $1::uuid
          AND a.status = 'PENDING'
          AND ss.tin_capture_order = 'before_transaction'
          AND COALESCE(ss.linking_window_seconds, 0) > 0
          AND a.created_at + (ss.linking_window_seconds * INTERVAL '1 second') <= NOW()
       RETURNING a.id
     )
     SELECT a.*, COALESCE(n.display_number, a.nozzle_number) AS display_number,
            c.buyer_name, c.tin
       FROM pre_fuel_customer_allocations a
       JOIN customers c ON c.id = a.customer_id AND c.station_id = a.station_id
  LEFT JOIN nozzles n ON n.id = a.nozzle_id AND n.station_id = a.station_id
      WHERE a.station_id = $1::uuid AND a.status = 'PENDING'
      ORDER BY a.created_at DESC`,
    [stationId],
  )
}

export async function claimPendingPreFuelCustomerAllocationTx(
  client: PoolClient,
  input: {
    stationId: string
    pumpNumber: number
    nozzleNumber?: number | null
    occurredAt: Date
  },
) {
  if (!input.nozzleNumber) return null
  const result = await txQuery<PreFuelCustomerAllocation>(
    client,
    `SELECT a.*
       FROM pre_fuel_customer_allocations a
       JOIN station_settings ss ON ss.station_id = a.station_id
      WHERE a.station_id = $1::uuid
        AND a.pump_number = $2::int
        AND a.nozzle_number = $3::int
        AND a.status = 'PENDING'
        AND a.created_at <= $4::timestamptz + INTERVAL '2 minutes'
        AND (COALESCE(ss.linking_window_seconds, 0) <= 0
          OR $4::timestamptz < a.created_at + (ss.linking_window_seconds * INTERVAL '1 second'))
      ORDER BY a.created_at DESC
      LIMIT 1
      FOR UPDATE OF a`,
    [input.stationId, input.pumpNumber, input.nozzleNumber, input.occurredAt],
  )
  return result.rows[0] ?? null
}

export async function consumePreFuelCustomerAllocationTx(
  client: PoolClient,
  input: { allocationId: string; transactionId: string },
) {
  await txQuery(
    client,
    `UPDATE pre_fuel_customer_allocations
        SET status = 'CONSUMED', transaction_id = $2::uuid, consumed_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid AND status = 'PENDING'`,
    [input.allocationId, input.transactionId],
  )
}
