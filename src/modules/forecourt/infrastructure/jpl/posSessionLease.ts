import { randomUUID } from 'node:crypto'
import os from 'node:os'

import { query, queryOne } from '@/src/platform/db/postgres/core'

export const JPL_POS_SESSION_LEASE_TTL_MS = 45_000
export const JPL_POS_SESSION_HEARTBEAT_MS = 15_000

export type JplPosSessionLease = {
  stationId: string
  posId: string
  ownerId: string
  expiresAt: string
}

type LeaseRow = {
  station_id: string
  pos_id: string
  owner_id: string
  expires_at: Date | string
}

export const createJplPosSessionOwnerId = () =>
  `${os.hostname()}:${process.pid}:${randomUUID()}`

export async function acquireJplPosSessionLease(input: {
  stationId: string
  posId: string
  ownerId: string
  ttlMs?: number
}): Promise<JplPosSessionLease | null> {
  const ttlMs = Math.max(
    10_000,
    Math.trunc(input.ttlMs ?? JPL_POS_SESSION_LEASE_TTL_MS),
  )
  const row = await queryOne<LeaseRow>(
    `INSERT INTO forecourt_jpl_pos_sessions (
       station_id, pos_id, owner_id, process_id, host_name, acquired_at,
       heartbeat_at, expires_at, released_at
     ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW() + ($6 * INTERVAL '1 millisecond'), NULL)
     ON CONFLICT (station_id, pos_id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       process_id = EXCLUDED.process_id,
       host_name = EXCLUDED.host_name,
       acquired_at = CASE
         WHEN forecourt_jpl_pos_sessions.owner_id = EXCLUDED.owner_id THEN forecourt_jpl_pos_sessions.acquired_at
         ELSE NOW()
       END,
       heartbeat_at = NOW(),
       expires_at = NOW() + ($6 * INTERVAL '1 millisecond'),
       released_at = NULL
     WHERE forecourt_jpl_pos_sessions.owner_id = EXCLUDED.owner_id
        OR forecourt_jpl_pos_sessions.released_at IS NOT NULL
        OR forecourt_jpl_pos_sessions.expires_at <= NOW()
     RETURNING station_id, pos_id, owner_id, expires_at`,
    [
      input.stationId,
      input.posId,
      input.ownerId,
      process.pid,
      os.hostname(),
      ttlMs,
    ],
  )

  if (!row) return null
  return {
    stationId: row.station_id,
    posId: row.pos_id,
    ownerId: row.owner_id,
    expiresAt: new Date(row.expires_at).toISOString(),
  }
}

export async function renewJplPosSessionLease(input: {
  stationId: string
  posId: string
  ownerId: string
  ttlMs?: number
}): Promise<boolean> {
  const ttlMs = Math.max(
    10_000,
    Math.trunc(input.ttlMs ?? JPL_POS_SESSION_LEASE_TTL_MS),
  )
  const result = await query(
    `UPDATE forecourt_jpl_pos_sessions
        SET heartbeat_at = NOW(),
            expires_at = NOW() + ($4 * INTERVAL '1 millisecond')
      WHERE station_id = $1
        AND pos_id = $2
        AND owner_id = $3
        AND released_at IS NULL
        AND expires_at > NOW()`,
    [input.stationId, input.posId, input.ownerId, ttlMs],
  )
  return (result.rowCount ?? 0) === 1
}

export async function releaseJplPosSessionLease(input: {
  stationId: string
  posId: string
  ownerId: string
}): Promise<void> {
  await query(
    `UPDATE forecourt_jpl_pos_sessions
        SET released_at = NOW(), expires_at = NOW()
      WHERE station_id = $1 AND pos_id = $2 AND owner_id = $3`,
    [input.stationId, input.posId, input.ownerId],
  )
}
