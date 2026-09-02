import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

export type TransactionCheckpointStage =
  | 'discovered'
  | 'read_locked'
  | 'captured'
  | 'clear_requested'
  | 'cleared'
  | 'failed'
  | 'blocked_by_foreign_pos'

export type TransactionCheckpointRow = {
  station_id: string
  source_mode: BufferMode
  fp_id: number
  trans_seq_no: number
  lifecycle_stage: TransactionCheckpointStage
  lock_id: string | null
  owner_pos_id: string | null
  blocked_by_foreign_pos: boolean
  read_attempts: number
  clear_attempts: number
  first_seen_at: string
  last_attempt_at: string | null
  last_success_at: string | null
  read_payload_json: any | null
  clear_payload_json: any | null
  normalized_transaction_id: string | null
  reconciled_at: string | null
  payload_cleared_at: string | null
  payload_clear_reason: string | null
  terminal_at: string | null
  terminal_outcome: string | null
  last_error: string | null
  updated_at: string
}

const selectColumns = `
  station_id,
  source_mode,
  fp_id,
  trans_seq_no,
  lifecycle_stage,
  lock_id,
  owner_pos_id,
  blocked_by_foreign_pos,
  read_attempts,
  clear_attempts,
  first_seen_at,
  last_attempt_at,
  last_success_at,
  read_payload_json,
  clear_payload_json,
  normalized_transaction_id,
  reconciled_at,
  payload_cleared_at,
  payload_clear_reason,
  terminal_at,
  terminal_outcome,
  last_error,
  updated_at
`

const sql = {
  upsert: `
    INSERT INTO forecourt_jpl_transaction_checkpoints (
      station_id,
      source_mode,
      fp_id,
      trans_seq_no,
      lifecycle_stage,
      lock_id,
      owner_pos_id,
      blocked_by_foreign_pos,
      read_attempts,
      clear_attempts,
      last_attempt_at,
      last_success_at,
      read_payload_json,
      clear_payload_json,
      terminal_at,
      terminal_outcome,
      last_error,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4,
      COALESCE($5, 'discovered'),
      $6, $7, $8,
      COALESCE($9, 0), COALESCE($10, 0),
      $11::timestamptz, $12::timestamptz,
      $13::jsonb, $14::jsonb,
      CASE WHEN $5 = 'cleared' THEN COALESCE($12::timestamptz, NOW()) ELSE NULL END,
      CASE WHEN $5 = 'cleared' THEN 'cleared' ELSE NULL END,
      $15,
      NOW()
    )
    ON CONFLICT (station_id, source_mode, fp_id, trans_seq_no)
    DO UPDATE SET
      lifecycle_stage = COALESCE(EXCLUDED.lifecycle_stage, forecourt_jpl_transaction_checkpoints.lifecycle_stage),
      lock_id = COALESCE(EXCLUDED.lock_id, forecourt_jpl_transaction_checkpoints.lock_id),
      owner_pos_id = COALESCE(EXCLUDED.owner_pos_id, forecourt_jpl_transaction_checkpoints.owner_pos_id),
      blocked_by_foreign_pos = EXCLUDED.blocked_by_foreign_pos,
      read_attempts = forecourt_jpl_transaction_checkpoints.read_attempts + COALESCE(EXCLUDED.read_attempts, 0),
      clear_attempts = forecourt_jpl_transaction_checkpoints.clear_attempts + COALESCE(EXCLUDED.clear_attempts, 0),
      last_attempt_at = COALESCE(EXCLUDED.last_attempt_at, forecourt_jpl_transaction_checkpoints.last_attempt_at),
      last_success_at = COALESCE(EXCLUDED.last_success_at, forecourt_jpl_transaction_checkpoints.last_success_at),
      read_payload_json = COALESCE(EXCLUDED.read_payload_json, forecourt_jpl_transaction_checkpoints.read_payload_json),
      clear_payload_json = COALESCE(EXCLUDED.clear_payload_json, forecourt_jpl_transaction_checkpoints.clear_payload_json),
      terminal_at = CASE
        WHEN EXCLUDED.lifecycle_stage = 'cleared'
          THEN COALESCE(forecourt_jpl_transaction_checkpoints.terminal_at, EXCLUDED.last_success_at, NOW())
        WHEN EXCLUDED.lifecycle_stage IN ('discovered', 'read_locked', 'captured', 'clear_requested', 'failed') THEN NULL
        ELSE forecourt_jpl_transaction_checkpoints.terminal_at
      END,
      terminal_outcome = CASE
        WHEN EXCLUDED.lifecycle_stage = 'cleared' THEN 'cleared'
        WHEN EXCLUDED.lifecycle_stage IN ('discovered', 'read_locked', 'captured', 'clear_requested', 'failed') THEN NULL
        ELSE forecourt_jpl_transaction_checkpoints.terminal_outcome
      END,
      payload_cleared_at = CASE
        WHEN EXCLUDED.read_payload_json IS NOT NULL OR EXCLUDED.clear_payload_json IS NOT NULL THEN NULL
        ELSE forecourt_jpl_transaction_checkpoints.payload_cleared_at
      END,
      payload_clear_reason = CASE
        WHEN EXCLUDED.read_payload_json IS NOT NULL OR EXCLUDED.clear_payload_json IS NOT NULL THEN NULL
        ELSE forecourt_jpl_transaction_checkpoints.payload_clear_reason
      END,
      last_error = EXCLUDED.last_error,
      updated_at = NOW()
  `,
  getByKey: `
    SELECT
      ${selectColumns}
    FROM forecourt_jpl_transaction_checkpoints
    WHERE station_id = $1
      AND source_mode = $2
      AND fp_id = $3
      AND trans_seq_no = $4
    LIMIT 1
  `,
  listActiveByStation: `
    SELECT
      ${selectColumns}
    FROM forecourt_jpl_transaction_checkpoints
    WHERE station_id = $1
      AND (
        lifecycle_stage <> 'cleared'
        OR blocked_by_foreign_pos = TRUE
        OR last_error IS NOT NULL
      )
    ORDER BY updated_at ASC
  `,
  listRecoverableByStation: `
    SELECT
      ${selectColumns}
    FROM forecourt_jpl_transaction_checkpoints
    WHERE station_id = $1
      AND blocked_by_foreign_pos = FALSE
      AND lifecycle_stage IN ('read_locked', 'captured', 'clear_requested', 'failed')
      AND (clear_attempts < $2 OR lifecycle_stage <> 'failed')
    ORDER BY updated_at ASC
    LIMIT $3
  `,
  listStaleForeignLocksByStation: `
    SELECT
      ${selectColumns}
    FROM forecourt_jpl_transaction_checkpoints
    WHERE station_id = $1
      AND blocked_by_foreign_pos = TRUE
      AND lifecycle_stage = 'blocked_by_foreign_pos'
      AND updated_at <= NOW() - make_interval(secs => $2)
    ORDER BY updated_at ASC
    LIMIT $3
  `,
} as const

export const forecourtJplTransactionCheckpointRepo = {
  async getByKey(args: {
    stationId: string
    sourceMode: BufferMode
    fpId: number
    transSeqNo: number
  }) {
    return await queryOne<TransactionCheckpointRow>(sql.getByKey, [
      args.stationId,
      args.sourceMode,
      args.fpId,
      args.transSeqNo,
    ])
  },
  async upsert(args: {
    stationId: string
    sourceMode: BufferMode
    fpId: number
    transSeqNo: number
    lifecycleStage?: TransactionCheckpointStage | null
    lockId?: string | null
    ownerPosId?: string | null
    blockedByForeignPos?: boolean
    readAttemptsIncrement?: number
    clearAttemptsIncrement?: number
    lastAttemptAt?: string | null
    lastSuccessAt?: string | null
    readPayloadJson?: any | null
    clearPayloadJson?: any | null
    lastError?: string | null
  }) {
    await query(sql.upsert, [
      args.stationId,
      args.sourceMode,
      args.fpId,
      args.transSeqNo,
      args.lifecycleStage ?? null,
      args.lockId ?? null,
      args.ownerPosId ?? null,
      Boolean(args.blockedByForeignPos),
      args.readAttemptsIncrement ?? 0,
      args.clearAttemptsIncrement ?? 0,
      args.lastAttemptAt ?? null,
      args.lastSuccessAt ?? null,
      args.readPayloadJson != null
        ? JSON.stringify(args.readPayloadJson)
        : null,
      args.clearPayloadJson != null
        ? JSON.stringify(args.clearPayloadJson)
        : null,
      args.lastError ?? null,
    ])
  },
  async listActiveByStation(args: { stationId: string }) {
    return await queryAll<TransactionCheckpointRow>(sql.listActiveByStation, [
      args.stationId,
    ])
  },
  async listRecoverableByStation(args: {
    stationId: string
    maxClearAttempts?: number
    limit?: number
  }) {
    return await queryAll<TransactionCheckpointRow>(
      sql.listRecoverableByStation,
      [
        args.stationId,
        Math.max(1, Number(args.maxClearAttempts ?? 5)),
        Math.max(1, Math.min(200, Number(args.limit ?? 50))),
      ],
    )
  },
  async listStaleForeignLocksByStation(args: {
    stationId: string
    staleAfterSeconds?: number
    limit?: number
  }) {
    return await queryAll<TransactionCheckpointRow>(
      sql.listStaleForeignLocksByStation,
      [
        args.stationId,
        Math.max(60, Number(args.staleAfterSeconds ?? 900)),
        Math.max(1, Math.min(200, Number(args.limit ?? 50))),
      ],
    )
  },
}
