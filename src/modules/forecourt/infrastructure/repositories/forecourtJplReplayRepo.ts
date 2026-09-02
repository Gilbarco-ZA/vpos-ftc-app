import type {
  BufferMode,
  SupervisedReplayRow,
  SupervisedReplayStage,
} from '@/src/modules/forecourt/infrastructure/jpl/types'

import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

const replaySelectColumns = `
  replay.station_id,
  replay.fp_id,
  replay.trans_seq_no,
  replay.replay_stage,
  replay.lock_id,
  COALESCE(checkpoint.read_payload_json, replay.read_payload_json) AS read_payload_json,
  COALESCE(checkpoint.clear_payload_json, replay.clear_fields_json) AS clear_fields_json,
  replay.payload_owner,
  replay.normalized_transaction_id,
  replay.payload_cleared_at,
  replay.payload_clear_reason,
  replay.terminal_at,
  replay.terminal_outcome,
  replay.captured_at,
  replay.cleared_at,
  replay.last_error,
  replay.updated_at
`

const checkpointJoin = `
  LEFT JOIN forecourt_jpl_transaction_checkpoints checkpoint
    ON checkpoint.station_id = replay.station_id
   AND checkpoint.source_mode = 'supervised'
   AND checkpoint.fp_id = replay.fp_id
   AND checkpoint.trans_seq_no = replay.trans_seq_no
`

const sql = {
  selectByKey: `
    SELECT
      ${replaySelectColumns}
    FROM forecourt_jpl_supervised_replay replay
    ${checkpointJoin}
    WHERE replay.station_id = $1
      AND replay.fp_id = $2
      AND replay.trans_seq_no = $3
    LIMIT 1
  `,
  upsertByKey: `
    INSERT INTO forecourt_jpl_supervised_replay (
      station_id,
      fp_id,
      trans_seq_no,
      replay_stage,
      lock_id,
      payload_owner,
      captured_at,
      cleared_at,
      last_error,
      terminal_at,
      terminal_outcome,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      COALESCE($4, 'discovered'),
      $5,
      'checkpoint',
      $6::timestamptz,
      $7::timestamptz,
      $8,
      CASE WHEN $4 = 'cleared' THEN COALESCE($7::timestamptz, NOW()) ELSE NULL END,
      CASE WHEN $4 = 'cleared' THEN 'cleared' ELSE NULL END,
      NOW()
    )
    ON CONFLICT (station_id, fp_id, trans_seq_no)
    DO UPDATE SET
      replay_stage = COALESCE(EXCLUDED.replay_stage, forecourt_jpl_supervised_replay.replay_stage),
      lock_id = COALESCE(EXCLUDED.lock_id, forecourt_jpl_supervised_replay.lock_id),
      payload_owner = 'checkpoint',
      captured_at = COALESCE(EXCLUDED.captured_at, forecourt_jpl_supervised_replay.captured_at),
      cleared_at = COALESCE(EXCLUDED.cleared_at, forecourt_jpl_supervised_replay.cleared_at),
      last_error = EXCLUDED.last_error,
      terminal_at = CASE
        WHEN EXCLUDED.replay_stage = 'cleared'
          THEN COALESCE(forecourt_jpl_supervised_replay.terminal_at, EXCLUDED.cleared_at, NOW())
        WHEN EXCLUDED.replay_stage IN ('discovered', 'read_locked', 'captured') THEN NULL
        ELSE forecourt_jpl_supervised_replay.terminal_at
      END,
      terminal_outcome = CASE
        WHEN EXCLUDED.replay_stage = 'cleared' THEN 'cleared'
        WHEN EXCLUDED.replay_stage IN ('discovered', 'read_locked', 'captured') THEN NULL
        ELSE forecourt_jpl_supervised_replay.terminal_outcome
      END,
      updated_at = NOW()
  `,
  deleteByKey: `
    DELETE FROM forecourt_jpl_supervised_replay
    WHERE station_id = $1
      AND fp_id = $2
      AND trans_seq_no = $3
  `,
  markTransactionCaptured: `
      UPDATE transactions txn
         SET doms_trans_lock_id = COALESCE($5, txn.doms_trans_lock_id),
             doms_normalized_at = COALESCE(txn.doms_normalized_at, NOW()),
             doms_reconciled_at = NOW(),
             doms_last_seen_at = NOW(),
             updated_at = NOW()
       WHERE txn.station_id = $1
         AND txn.id = COALESCE(
           (
             SELECT checkpoint.normalized_transaction_id
               FROM forecourt_jpl_transaction_checkpoints checkpoint
              WHERE checkpoint.station_id = $1
                AND checkpoint.source_mode = $2
                AND checkpoint.fp_id = $3
                AND checkpoint.trans_seq_no = $4
              LIMIT 1
           ),
           (
             SELECT current_txn.id
               FROM transactions current_txn
              WHERE current_txn.station_id = $1
                AND current_txn.doms_source_system = 'jpl'
                AND current_txn.doms_source_mode = $2
                AND current_txn.doms_fp_id = $3
                AND current_txn.doms_trans_seq_no = $4
              ORDER BY current_txn.doms_last_seen_at DESC NULLS LAST, current_txn.created_at DESC
              LIMIT 1
           )
         )
  `,
  markTransactionCleared: `
      UPDATE transactions txn
         SET doms_cleared_at = NOW(),
             doms_reconciled_at = NOW(),
             updated_at = NOW()
       WHERE txn.station_id = $1
         AND txn.doms_source_system = 'jpl'
         AND txn.id = COALESCE(
           (
             SELECT checkpoint.normalized_transaction_id
               FROM forecourt_jpl_transaction_checkpoints checkpoint
              WHERE checkpoint.station_id = $1
                AND checkpoint.source_mode = $2
                AND checkpoint.fp_id = $3
                AND checkpoint.trans_seq_no = $4
              LIMIT 1
           ),
           (
             SELECT current_txn.id
               FROM transactions current_txn
              WHERE current_txn.station_id = $1
                AND current_txn.doms_source_system = 'jpl'
                AND current_txn.doms_source_mode = $2
                AND current_txn.doms_fp_id = $3
                AND current_txn.doms_trans_seq_no = $4
              ORDER BY current_txn.doms_last_seen_at DESC NULLS LAST, current_txn.created_at DESC
              LIMIT 1
           )
         )
  `,
  listPendingClearRows: `
      SELECT
        ${replaySelectColumns},
        txn.id AS transaction_id,
        txn.status AS transaction_status,
        txn.deleted_at::text AS transaction_deleted_at
      FROM forecourt_jpl_supervised_replay replay
      ${checkpointJoin}
      LEFT JOIN transactions txn
        ON txn.station_id = replay.station_id
       AND txn.doms_source_system = 'jpl'
       AND txn.id = COALESCE(
         checkpoint.normalized_transaction_id,
         replay.normalized_transaction_id
       )
      WHERE replay.station_id = $1
        AND replay.replay_stage IN ('read_locked', 'captured')
      ORDER BY replay.updated_at ASC
  `,
  findTransactionByIdentity: `
      SELECT txn.id, txn.status, txn.deleted_at::text AS deleted_at
        FROM transactions txn
       WHERE txn.station_id = $1
         AND txn.doms_source_system = 'jpl'
         AND txn.doms_transaction_identity = $2
       LIMIT 1
  `,
  findTransactionByReplayKey: `
      SELECT txn.id, txn.status, txn.deleted_at::text AS deleted_at
      FROM forecourt_jpl_supervised_replay replay
      ${checkpointJoin}
      LEFT JOIN transactions txn
        ON txn.station_id = replay.station_id
       AND txn.doms_source_system = 'jpl'
       AND txn.id = COALESCE(
         checkpoint.normalized_transaction_id,
         replay.normalized_transaction_id
       )
      WHERE replay.station_id = $1
        AND replay.fp_id = $2
        AND replay.trans_seq_no = $3
      LIMIT 1
  `,
} as const

export const forecourtJplReplayRepo = {
  async getByKey(args: {
    stationId: string
    fpId: number
    transSeqNo: number
  }): Promise<SupervisedReplayRow | null> {
    return await queryOne<SupervisedReplayRow>(sql.selectByKey, [
      args.stationId,
      args.fpId,
      args.transSeqNo,
    ])
  },
  async upsert(args: {
    stationId: string
    fpId: number
    transSeqNo: number
    replayStage?: SupervisedReplayStage
    lockId?: string | null
    capturedAt?: string | null
    clearedAt?: string | null
    lastError?: string | null
  }) {
    await query(sql.upsertByKey, [
      args.stationId,
      args.fpId,
      args.transSeqNo,
      args.replayStage ?? null,
      args.lockId ?? null,
      args.capturedAt ?? null,
      args.clearedAt ?? null,
      args.lastError ?? null,
    ])
  },
  async deleteByKey(args: {
    stationId: string
    fpId: number
    transSeqNo: number
  }) {
    await query(sql.deleteByKey, [args.stationId, args.fpId, args.transSeqNo])
  },
  async markTransactionCaptured(args: {
    stationId: string
    sourceMode: BufferMode
    fpId: number
    transSeqNo: number
    transLockId?: string | null
  }) {
    await query(sql.markTransactionCaptured, [
      args.stationId,
      args.sourceMode,
      args.fpId,
      args.transSeqNo,
      args.transLockId ?? null,
    ])
  },
  async markTransactionCleared(args: {
    stationId: string
    sourceMode: BufferMode
    fpId: number
    transSeqNo: number
  }) {
    await query(sql.markTransactionCleared, [
      args.stationId,
      args.sourceMode,
      args.fpId,
      args.transSeqNo,
    ])
  },
  async findTransactionByIdentity(args: {
    stationId: string
    transactionIdentity: string
  }) {
    return await queryOne<{
      id: string
      status: string
      deleted_at: string | null
    }>(sql.findTransactionByIdentity, [
      args.stationId,
      args.transactionIdentity,
    ])
  },
  async findTransactionByReplayKey(args: {
    stationId: string
    fpId: number
    transSeqNo: number
  }) {
    return await queryOne<{
      id: string
      status: string
      deleted_at: string | null
    }>(sql.findTransactionByReplayKey, [
      args.stationId,
      args.fpId,
      args.transSeqNo,
    ])
  },
  async listPendingClearRows(args: {
    stationId: string
  }): Promise<SupervisedReplayRow[]> {
    return await queryAll<SupervisedReplayRow>(sql.listPendingClearRows, [
      args.stationId,
    ])
  },
}
