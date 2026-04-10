export const forecourtJplReplaySql = {
  selectByKey: `
    SELECT
      station_id,
      fp_id,
      trans_seq_no,
      replay_stage,
      lock_id,
      read_payload_json,
      clear_fields_json,
      captured_at,
      cleared_at,
      last_error,
      updated_at
    FROM forecourt_jpl_supervised_replay
    WHERE station_id = $1
      AND fp_id = $2
      AND trans_seq_no = $3
    LIMIT 1
  `,
  upsertByKey: `
    INSERT INTO forecourt_jpl_supervised_replay (
      station_id,
      fp_id,
      trans_seq_no,
      replay_stage,
      lock_id,
      read_payload_json,
      clear_fields_json,
      captured_at,
      cleared_at,
      last_error,
      updated_at
    )
    VALUES (
      $1, $2, $3,
      COALESCE($4, 'discovered'),
      $5,
      $6::jsonb,
      $7::jsonb,
      $8::timestamptz,
      $9::timestamptz,
      $10,
      NOW()
    )
    ON CONFLICT (station_id, fp_id, trans_seq_no)
    DO UPDATE SET
      replay_stage = COALESCE(EXCLUDED.replay_stage, forecourt_jpl_supervised_replay.replay_stage),
      lock_id = COALESCE(EXCLUDED.lock_id, forecourt_jpl_supervised_replay.lock_id),
      read_payload_json = COALESCE(EXCLUDED.read_payload_json, forecourt_jpl_supervised_replay.read_payload_json),
      clear_fields_json = COALESCE(EXCLUDED.clear_fields_json, forecourt_jpl_supervised_replay.clear_fields_json),
      captured_at = COALESCE(EXCLUDED.captured_at, forecourt_jpl_supervised_replay.captured_at),
      cleared_at = COALESCE(EXCLUDED.cleared_at, forecourt_jpl_supervised_replay.cleared_at),
      last_error = COALESCE(EXCLUDED.last_error, forecourt_jpl_supervised_replay.last_error),
      updated_at = NOW()
  `,
  deleteByKey: `
    DELETE FROM forecourt_jpl_supervised_replay
    WHERE station_id = $1
      AND fp_id = $2
      AND trans_seq_no = $3
  `,

  markTransactionCaptured: `
      UPDATE transactions
         SET doms_trans_lock_id = COALESCE($5, doms_trans_lock_id),
             doms_reconciled_at = NOW(),
             doms_last_seen_at = NOW(),
             updated_at = NOW()
       WHERE station_id = $1
         AND doms_source_mode = $2
         AND doms_fp_id = $3
         AND doms_trans_seq_no = $4
  `,
  markTransactionCleared: `
      UPDATE transactions
         SET doms_cleared_at = NOW(),
             doms_reconciled_at = NOW(),
             updated_at = NOW()
       WHERE station_id = $1
         AND doms_source_system = 'jpl'
         AND doms_source_mode = $2
         AND doms_fp_id = $3
         AND doms_trans_seq_no = $4
  `,
  listPendingClearRows: `
      SELECT
        station_id,
        fp_id,
        trans_seq_no,
        replay_stage,
        lock_id,
        read_payload_json,
        clear_fields_json,
        captured_at,
        cleared_at,
        last_error,
        updated_at
      FROM forecourt_jpl_supervised_replay
      WHERE station_id = $1
        AND replay_stage IN ('read_locked', 'captured')
      ORDER BY updated_at ASC
  `,
} as const
