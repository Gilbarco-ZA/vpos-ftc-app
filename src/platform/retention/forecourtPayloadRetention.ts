import type { PoolClient } from '@/src/platform/db/postgres'
import type { StorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'

import { txQuery } from '@/src/platform/db/postgres'

export type ForecourtPayloadCompactionTargetResult = {
  key: string
  examined: number
  compacted: number
  skipped: number
  batches: number
  oldestRemaining: string | null
  durationMs: number
  error: string | null
}

const CLEAR_REASON = 'normalized_reconciled_controller_cleared_lines_persisted'

type ForecourtPayloadTarget = {
  key: string
  lockAlias: string
  clearReason?: string
  candidateSql: string
  updateSql: string
  oldestSql: string
}

const activeCheckpointSql = `EXISTS (
  SELECT 1
    FROM forecourt_jpl_transaction_checkpoints checkpoint
   WHERE checkpoint.station_id = txn.station_id
     AND checkpoint.source_mode = txn.doms_source_mode
     AND checkpoint.fp_id = txn.doms_fp_id
     AND checkpoint.trans_seq_no = txn.doms_trans_seq_no
     AND (
       checkpoint.normalized_transaction_id = txn.id
       OR checkpoint.normalized_transaction_id IS NULL
     )
     AND (
       checkpoint.lifecycle_stage <> 'cleared'
       OR checkpoint.blocked_by_foreign_pos = TRUE
       OR checkpoint.last_error IS NOT NULL
     )
)`

const activeSupervisedReplaySql = `EXISTS (
  SELECT 1
    FROM forecourt_jpl_supervised_replay replay
   WHERE replay.station_id = txn.station_id
     AND txn.doms_source_mode = 'supervised'
     AND replay.fp_id = txn.doms_fp_id
     AND replay.trans_seq_no = txn.doms_trans_seq_no
     AND (
       replay.normalized_transaction_id = txn.id
       OR replay.normalized_transaction_id IS NULL
     )
     AND (replay.replay_stage <> 'cleared' OR replay.last_error IS NOT NULL)
)`

const targets: ForecourtPayloadTarget[] = [
  {
    key: 'transactions_doms_payload',
    lockAlias: 'txn',
    candidateSql: `
      SELECT txn.id AS candidate_id
        FROM transactions txn
       WHERE txn.station_id = $1::uuid
         AND txn.doms_source_system = 'jpl'
         AND txn.doms_payload_json IS NOT NULL
         AND txn.doms_payload_cleared_at IS NULL
         AND txn.doms_normalized_at IS NOT NULL
         AND txn.doms_reconciled_at IS NOT NULL
         AND txn.doms_cleared_at IS NOT NULL
         AND txn.doms_cleared_at < NOW() - ($2 * INTERVAL '1 day')
         AND EXISTS (
           SELECT 1
             FROM transaction_lines line
            WHERE line.transaction_id = txn.id
         )
         AND NOT (${activeCheckpointSql})
         AND NOT (${activeSupervisedReplaySql})
       ORDER BY txn.doms_cleared_at, txn.id
       LIMIT $3
    `,
    updateSql: `
      UPDATE transactions target
         SET doms_payload_json = NULL,
             doms_unattended_receipt_json = NULL,
             doms_unattended_payment_json = NULL,
             doms_payload_cleared_at = NOW(),
             doms_payload_clear_reason = $4,
             updated_at = NOW()
        FROM candidates
       WHERE target.id = candidates.candidate_id
       RETURNING target.id
    `,
    oldestSql: `
      SELECT MIN(txn.doms_cleared_at)::text AS oldest_remaining
        FROM transactions txn
       WHERE txn.station_id = $1::uuid
         AND txn.doms_source_system = 'jpl'
         AND txn.doms_payload_json IS NOT NULL
         AND txn.doms_payload_cleared_at IS NULL
         AND txn.doms_normalized_at IS NOT NULL
         AND txn.doms_reconciled_at IS NOT NULL
         AND txn.doms_cleared_at IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM transaction_lines line WHERE line.transaction_id = txn.id
         )
         AND NOT (${activeCheckpointSql})
         AND NOT (${activeSupervisedReplaySql})
    `,
  },
  {
    key: 'forecourt_transaction_raw',
    lockAlias: 'raw_tx',
    candidateSql: `
      SELECT raw_tx.id AS candidate_id, txn.id AS transaction_id
        FROM forecourt_transactions raw_tx
        JOIN transactions txn
          ON txn.id = raw_tx.normalized_transaction_id
         AND txn.station_id = raw_tx.station_id
       WHERE raw_tx.station_id = $1::uuid
         AND raw_tx.raw_cleared_at IS NULL
         AND raw_tx.raw IS NOT NULL
         AND raw_tx.raw <> '{}'::jsonb
         AND raw_tx.normalized_at IS NOT NULL
         AND raw_tx.reconciled_at IS NOT NULL
         AND txn.doms_payload_cleared_at IS NOT NULL
         AND txn.doms_cleared_at IS NOT NULL
         AND txn.doms_cleared_at < NOW() - ($2 * INTERVAL '1 day')
       ORDER BY txn.doms_cleared_at, raw_tx.id
       LIMIT $3
    `,
    updateSql: `
      UPDATE forecourt_transactions target
         SET raw = '{}'::jsonb,
             doms_unattended_receipt_json = NULL,
             doms_unattended_payment_json = NULL,
             raw_cleared_at = NOW(),
             raw_clear_reason = $4
        FROM candidates
       WHERE target.id = candidates.candidate_id
       RETURNING target.id
    `,
    oldestSql: `
      SELECT MIN(txn.doms_cleared_at)::text AS oldest_remaining
        FROM forecourt_transactions raw_tx
        JOIN transactions txn
          ON txn.id = raw_tx.normalized_transaction_id
         AND txn.station_id = raw_tx.station_id
       WHERE raw_tx.station_id = $1::uuid
         AND raw_tx.raw_cleared_at IS NULL
         AND raw_tx.raw IS NOT NULL
         AND raw_tx.raw <> '{}'::jsonb
         AND raw_tx.normalized_at IS NOT NULL
         AND raw_tx.reconciled_at IS NOT NULL
         AND txn.doms_payload_cleared_at IS NOT NULL
    `,
  },
  {
    key: 'jpl_transaction_checkpoint_payloads',
    lockAlias: 'checkpoint',
    candidateSql: `
      SELECT checkpoint.station_id,
             checkpoint.source_mode,
             checkpoint.fp_id,
             checkpoint.trans_seq_no
        FROM forecourt_jpl_transaction_checkpoints checkpoint
        JOIN transactions txn
          ON txn.id = checkpoint.normalized_transaction_id
         AND txn.station_id = checkpoint.station_id
       WHERE checkpoint.station_id = $1::uuid
         AND checkpoint.lifecycle_stage = 'cleared'
         AND checkpoint.blocked_by_foreign_pos = FALSE
         AND checkpoint.last_error IS NULL
         AND checkpoint.payload_cleared_at IS NULL
         AND (checkpoint.read_payload_json IS NOT NULL OR checkpoint.clear_payload_json IS NOT NULL)
         AND checkpoint.last_success_at IS NOT NULL
         AND checkpoint.last_success_at < NOW() - ($2 * INTERVAL '1 day')
         AND txn.doms_payload_cleared_at IS NOT NULL
       ORDER BY checkpoint.last_success_at,
                checkpoint.source_mode,
                checkpoint.fp_id,
                checkpoint.trans_seq_no
       LIMIT $3
    `,
    updateSql: `
      UPDATE forecourt_jpl_transaction_checkpoints target
         SET read_payload_json = NULL,
             clear_payload_json = NULL,
             payload_cleared_at = NOW(),
             payload_clear_reason = $4,
             updated_at = NOW()
        FROM candidates
       WHERE target.station_id = candidates.station_id
         AND target.source_mode = candidates.source_mode
         AND target.fp_id = candidates.fp_id
         AND target.trans_seq_no = candidates.trans_seq_no
       RETURNING target.station_id
    `,
    oldestSql: `
      SELECT MIN(checkpoint.last_success_at)::text AS oldest_remaining
        FROM forecourt_jpl_transaction_checkpoints checkpoint
        JOIN transactions txn
          ON txn.id = checkpoint.normalized_transaction_id
         AND txn.station_id = checkpoint.station_id
       WHERE checkpoint.station_id = $1::uuid
         AND checkpoint.lifecycle_stage = 'cleared'
         AND checkpoint.blocked_by_foreign_pos = FALSE
         AND checkpoint.last_error IS NULL
         AND checkpoint.payload_cleared_at IS NULL
         AND (checkpoint.read_payload_json IS NOT NULL OR checkpoint.clear_payload_json IS NOT NULL)
         AND txn.doms_payload_cleared_at IS NOT NULL
    `,
  },
  {
    key: 'jpl_supervised_replay_duplicate_payloads',
    lockAlias: 'replay',
    clearReason: 'payload_consolidated_to_checkpoint',
    candidateSql: `
      SELECT replay.station_id,
             replay.fp_id,
             replay.trans_seq_no
        FROM forecourt_jpl_supervised_replay replay
        JOIN forecourt_jpl_transaction_checkpoints checkpoint
          ON checkpoint.station_id = replay.station_id
         AND checkpoint.source_mode = 'supervised'
         AND checkpoint.fp_id = replay.fp_id
         AND checkpoint.trans_seq_no = replay.trans_seq_no
       WHERE replay.station_id = $1::uuid
         AND replay.payload_owner = 'checkpoint'
         AND replay.payload_cleared_at IS NULL
         AND (replay.read_payload_json IS NOT NULL OR replay.clear_fields_json IS NOT NULL)
         AND (replay.read_payload_json IS NULL OR checkpoint.read_payload_json IS NOT NULL)
         AND (replay.clear_fields_json IS NULL OR checkpoint.clear_payload_json IS NOT NULL)
         AND checkpoint.updated_at < NOW() - ($2 * INTERVAL '1 day')
       ORDER BY checkpoint.updated_at, replay.fp_id, replay.trans_seq_no
       LIMIT $3
    `,
    updateSql: `
      UPDATE forecourt_jpl_supervised_replay target
         SET read_payload_json = NULL,
             clear_fields_json = NULL,
             payload_owner = 'checkpoint',
             payload_cleared_at = NOW(),
             payload_clear_reason = $4,
             updated_at = NOW()
        FROM candidates
       WHERE target.station_id = candidates.station_id
         AND target.fp_id = candidates.fp_id
         AND target.trans_seq_no = candidates.trans_seq_no
       RETURNING target.station_id
    `,
    oldestSql: `
      SELECT MIN(checkpoint.updated_at)::text AS oldest_remaining
        FROM forecourt_jpl_supervised_replay replay
        JOIN forecourt_jpl_transaction_checkpoints checkpoint
          ON checkpoint.station_id = replay.station_id
         AND checkpoint.source_mode = 'supervised'
         AND checkpoint.fp_id = replay.fp_id
         AND checkpoint.trans_seq_no = replay.trans_seq_no
       WHERE replay.station_id = $1::uuid
         AND replay.payload_owner = 'checkpoint'
         AND replay.payload_cleared_at IS NULL
         AND (replay.read_payload_json IS NOT NULL OR replay.clear_fields_json IS NOT NULL)
         AND (replay.read_payload_json IS NULL OR checkpoint.read_payload_json IS NOT NULL)
         AND (replay.clear_fields_json IS NULL OR checkpoint.clear_payload_json IS NOT NULL)
    `,
  },
  {
    key: 'transactions_unattended_payloads',
    lockAlias: 'txn',
    clearReason: 'typed_unattended_fields_persisted_controller_cleared',
    candidateSql: `
      SELECT txn.id AS candidate_id
        FROM transactions txn
       WHERE txn.station_id = $1::uuid
         AND txn.doms_source_system = 'jpl'
         AND (
           txn.doms_unattended_receipt_json IS NOT NULL
           OR txn.doms_unattended_payment_json IS NOT NULL
         )
         AND txn.doms_normalized_at IS NOT NULL
         AND txn.doms_reconciled_at IS NOT NULL
         AND txn.doms_cleared_at IS NOT NULL
         AND txn.doms_cleared_at < NOW() - ($2 * INTERVAL '1 day')
         AND EXISTS (
           SELECT 1
             FROM transaction_lines line
            WHERE line.transaction_id = txn.id
         )
         AND NOT (${activeCheckpointSql})
         AND NOT (${activeSupervisedReplaySql})
       ORDER BY txn.doms_cleared_at, txn.id
       LIMIT $3
    `,
    updateSql: `
      UPDATE transactions target
         SET doms_unattended_receipt_json = NULL,
             doms_unattended_payment_json = NULL,
             doms_payload_clear_reason = COALESCE(target.doms_payload_clear_reason, $4),
             updated_at = NOW()
        FROM candidates
       WHERE target.id = candidates.candidate_id
       RETURNING target.id
    `,
    oldestSql: `
      SELECT MIN(txn.doms_cleared_at)::text AS oldest_remaining
        FROM transactions txn
       WHERE txn.station_id = $1::uuid
         AND txn.doms_source_system = 'jpl'
         AND (
           txn.doms_unattended_receipt_json IS NOT NULL
           OR txn.doms_unattended_payment_json IS NOT NULL
         )
         AND txn.doms_normalized_at IS NOT NULL
         AND txn.doms_reconciled_at IS NOT NULL
         AND txn.doms_cleared_at IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM transaction_lines line WHERE line.transaction_id = txn.id
         )
         AND NOT (${activeCheckpointSql})
         AND NOT (${activeSupervisedReplaySql})
    `,
  },
  {
    key: 'forecourt_transaction_unattended_payloads',
    lockAlias: 'raw_tx',
    clearReason: 'typed_unattended_fields_persisted_controller_cleared',
    candidateSql: `
      SELECT raw_tx.id AS candidate_id
        FROM forecourt_transactions raw_tx
        JOIN transactions txn
          ON txn.id = raw_tx.normalized_transaction_id
         AND txn.station_id = raw_tx.station_id
       WHERE raw_tx.station_id = $1::uuid
         AND (
           raw_tx.doms_unattended_receipt_json IS NOT NULL
           OR raw_tx.doms_unattended_payment_json IS NOT NULL
         )
         AND raw_tx.normalized_at IS NOT NULL
         AND raw_tx.reconciled_at IS NOT NULL
         AND txn.doms_cleared_at IS NOT NULL
         AND txn.doms_cleared_at < NOW() - ($2 * INTERVAL '1 day')
         AND txn.doms_payload_cleared_at IS NOT NULL
       ORDER BY txn.doms_cleared_at, raw_tx.id
       LIMIT $3
    `,
    updateSql: `
      UPDATE forecourt_transactions target
         SET doms_unattended_receipt_json = NULL,
             doms_unattended_payment_json = NULL,
             raw_clear_reason = COALESCE(target.raw_clear_reason, $4)
        FROM candidates
       WHERE target.id = candidates.candidate_id
       RETURNING target.id
    `,
    oldestSql: `
      SELECT MIN(txn.doms_cleared_at)::text AS oldest_remaining
        FROM forecourt_transactions raw_tx
        JOIN transactions txn
          ON txn.id = raw_tx.normalized_transaction_id
         AND txn.station_id = raw_tx.station_id
       WHERE raw_tx.station_id = $1::uuid
         AND (
           raw_tx.doms_unattended_receipt_json IS NOT NULL
           OR raw_tx.doms_unattended_payment_json IS NOT NULL
         )
         AND raw_tx.normalized_at IS NOT NULL
         AND raw_tx.reconciled_at IS NOT NULL
         AND txn.doms_payload_cleared_at IS NOT NULL
    `,
  },
  {
    key: 'tank_gauge_raw_payloads',
    lockAlias: 'tank',
    clearReason: 'compact_tank_diagnostics_persisted',
    candidateSql: `
      SELECT tank.id AS candidate_id
        FROM tanks tank
       WHERE tank.station_id = $1::uuid
         AND tank.last_tg_payload IS NOT NULL
         AND tank.last_tg_diagnostics IS NOT NULL
         AND tank.last_tg_payload_cleared_at IS NULL
         AND COALESCE(tank.live_volume_updated_at, tank.updated_at)
             < NOW() - ($2 * INTERVAL '1 day')
       ORDER BY COALESCE(tank.live_volume_updated_at, tank.updated_at), tank.id
       LIMIT $3
    `,
    updateSql: `
      UPDATE tanks target
         SET last_tg_payload = NULL,
             last_tg_payload_cleared_at = NOW(),
             last_tg_payload_clear_reason = $4,
             updated_at = NOW()
        FROM candidates
       WHERE target.id = candidates.candidate_id
       RETURNING target.id
    `,
    oldestSql: `
      SELECT MIN(COALESCE(tank.live_volume_updated_at, tank.updated_at))::text AS oldest_remaining
        FROM tanks tank
       WHERE tank.station_id = $1::uuid
         AND tank.last_tg_payload IS NOT NULL
         AND tank.last_tg_diagnostics IS NOT NULL
         AND tank.last_tg_payload_cleared_at IS NULL
    `,
  },
]

function serializeTimestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString()
  return value == null ? null : String(value)
}

async function compactTarget(args: {
  client: PoolClient
  stationId: string
  target: ForecourtPayloadTarget
  policy: StorageRetentionPolicy
}): Promise<ForecourtPayloadCompactionTargetResult> {
  const { client, stationId, target, policy } = args
  const startedAt = Date.now()
  const savepoint = `forecourt_payload_${target.key}`
  await txQuery(client, `SAVEPOINT ${savepoint}`)
  let examined = 0
  let compacted = 0
  let batches = 0

  try {
    for (let index = 0; index < policy.maxBatches; index += 1) {
      const lock = policy.forecourtPayloadDryRun
        ? ''
        : `FOR UPDATE OF ${target.lockAlias} SKIP LOCKED`
      const action = policy.forecourtPayloadDryRun
        ? 'SELECT * FROM candidates'
        : target.updateSql
      const parameters = [
        stationId,
        policy.forecourtPayloadGraceDays,
        policy.batchSize,
      ]
      if (!policy.forecourtPayloadDryRun) {
        parameters.push(target.clearReason ?? CLEAR_REASON)
      }
      const result = await txQuery(
        client,
        `WITH candidates AS (
          ${target.candidateSql}
          ${lock}
        )
        ${action}`,
        parameters,
      )
      const count = result.rowCount ?? result.rows.length
      examined += count
      if (!policy.forecourtPayloadDryRun) compacted += count
      if (count > 0) batches += 1
      if (count < policy.batchSize || policy.forecourtPayloadDryRun) break
    }

    const oldest = await txQuery<{ oldest_remaining: Date | string | null }>(
      client,
      target.oldestSql,
      [stationId],
    )
    await txQuery(client, `RELEASE SAVEPOINT ${savepoint}`)
    return {
      key: target.key,
      examined,
      compacted,
      skipped: policy.forecourtPayloadDryRun ? examined : 0,
      batches,
      oldestRemaining: serializeTimestamp(oldest.rows[0]?.oldest_remaining),
      durationMs: Date.now() - startedAt,
      error: null,
    }
  } catch (error) {
    await txQuery(client, `ROLLBACK TO SAVEPOINT ${savepoint}`)
    await txQuery(client, `RELEASE SAVEPOINT ${savepoint}`)
    return {
      key: target.key,
      examined,
      compacted,
      skipped: policy.forecourtPayloadDryRun ? examined : 0,
      batches,
      oldestRemaining: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

type ForecourtPayloadLinkRepairTarget = {
  key: string
  lockAlias: string
  candidateSql: string
  updateSql: string
}

const linkRepairTargets: ForecourtPayloadLinkRepairTarget[] = [
  {
    key: 'raw',
    lockAlias: 'raw_tx',
    candidateSql: `
      SELECT raw_tx.id AS candidate_id, txn.id AS transaction_id
        FROM forecourt_transactions raw_tx
        JOIN transactions txn
          ON txn.station_id = raw_tx.station_id
         AND txn.doms_source_system = 'jpl'
         AND txn.doms_source_mode = COALESCE(
           raw_tx.source_mode,
           CASE WHEN raw_tx.is_supported THEN 'supervised' ELSE 'unsupervised' END
         )
         AND txn.doms_fp_id = raw_tx.fp_id
         AND txn.doms_trans_seq_no = raw_tx.trans_seq_no
       WHERE raw_tx.station_id = $1::uuid
         AND raw_tx.normalized_transaction_id IS NULL
       ORDER BY raw_tx.occurred_at, raw_tx.id
       LIMIT $2
    `,
    updateSql: `
      UPDATE forecourt_transactions raw_tx
         SET source_mode = COALESCE(raw_tx.source_mode, txn.doms_source_mode),
             normalized_transaction_id = txn.id,
             normalized_at = COALESCE(
               raw_tx.normalized_at,
               txn.doms_normalized_at,
               txn.doms_reconciled_at
             ),
             reconciled_at = COALESCE(raw_tx.reconciled_at, txn.doms_reconciled_at)
        FROM candidates
        JOIN transactions txn ON txn.id = candidates.transaction_id
       WHERE raw_tx.id = candidates.candidate_id
       RETURNING raw_tx.id
    `,
  },
  {
    key: 'checkpoint',
    lockAlias: 'checkpoint',
    candidateSql: `
      SELECT checkpoint.station_id,
             checkpoint.source_mode,
             checkpoint.fp_id,
             checkpoint.trans_seq_no,
             txn.id AS transaction_id
        FROM forecourt_jpl_transaction_checkpoints checkpoint
        JOIN transactions txn
          ON txn.station_id = checkpoint.station_id
         AND txn.doms_source_system = 'jpl'
         AND txn.doms_source_mode = checkpoint.source_mode
         AND txn.doms_fp_id = checkpoint.fp_id
         AND txn.doms_trans_seq_no = checkpoint.trans_seq_no
       WHERE checkpoint.station_id = $1::uuid
         AND checkpoint.normalized_transaction_id IS NULL
       ORDER BY checkpoint.updated_at,
                checkpoint.source_mode,
                checkpoint.fp_id,
                checkpoint.trans_seq_no
       LIMIT $2
    `,
    updateSql: `
      UPDATE forecourt_jpl_transaction_checkpoints checkpoint
         SET normalized_transaction_id = candidates.transaction_id,
             reconciled_at = COALESCE(checkpoint.reconciled_at, txn.doms_reconciled_at),
             updated_at = NOW()
        FROM candidates
        JOIN transactions txn ON txn.id = candidates.transaction_id
       WHERE checkpoint.station_id = candidates.station_id
         AND checkpoint.source_mode = candidates.source_mode
         AND checkpoint.fp_id = candidates.fp_id
         AND checkpoint.trans_seq_no = candidates.trans_seq_no
       RETURNING checkpoint.station_id
    `,
  },
  {
    key: 'replay',
    lockAlias: 'replay',
    candidateSql: `
      SELECT replay.station_id,
             replay.fp_id,
             replay.trans_seq_no,
             txn.id AS transaction_id
        FROM forecourt_jpl_supervised_replay replay
        JOIN transactions txn
          ON txn.station_id = replay.station_id
         AND txn.doms_source_system = 'jpl'
         AND txn.doms_source_mode = 'supervised'
         AND txn.doms_fp_id = replay.fp_id
         AND txn.doms_trans_seq_no = replay.trans_seq_no
       WHERE replay.station_id = $1::uuid
         AND replay.normalized_transaction_id IS NULL
       ORDER BY replay.updated_at, replay.fp_id, replay.trans_seq_no
       LIMIT $2
    `,
    updateSql: `
      UPDATE forecourt_jpl_supervised_replay replay
         SET normalized_transaction_id = candidates.transaction_id,
             updated_at = NOW()
        FROM candidates
       WHERE replay.station_id = candidates.station_id
         AND replay.fp_id = candidates.fp_id
         AND replay.trans_seq_no = candidates.trans_seq_no
       RETURNING replay.station_id
    `,
  },
]

async function repairForecourtPayloadLinks(args: {
  client: PoolClient
  stationId: string
  policy: StorageRetentionPolicy
}): Promise<ForecourtPayloadCompactionTargetResult> {
  const startedAt = Date.now()
  const { client, stationId, policy } = args
  await txQuery(client, 'SAVEPOINT forecourt_payload_link_repair')
  let examined = 0
  let repaired = 0
  let batches = 0

  try {
    for (const target of linkRepairTargets) {
      for (let index = 0; index < policy.maxBatches; index += 1) {
        const lock = policy.forecourtPayloadDryRun
          ? ''
          : `FOR UPDATE OF ${target.lockAlias} SKIP LOCKED`
        const action = policy.forecourtPayloadDryRun
          ? 'SELECT * FROM candidates'
          : target.updateSql
        const result = await txQuery(
          client,
          `WITH candidates AS (
            ${target.candidateSql}
            ${lock}
          )
          ${action}`,
          [stationId, policy.batchSize],
        )
        const count = result.rowCount ?? result.rows.length
        examined += count
        if (!policy.forecourtPayloadDryRun) repaired += count
        if (count > 0) batches += 1
        if (count < policy.batchSize || policy.forecourtPayloadDryRun) break
      }
    }

    await txQuery(client, 'RELEASE SAVEPOINT forecourt_payload_link_repair')
    return {
      key: 'forecourt_payload_link_repairs',
      examined,
      compacted: repaired,
      skipped: policy.forecourtPayloadDryRun ? examined : 0,
      batches,
      oldestRemaining: null,
      durationMs: Date.now() - startedAt,
      error: null,
    }
  } catch (error) {
    await txQuery(client, 'ROLLBACK TO SAVEPOINT forecourt_payload_link_repair')
    await txQuery(client, 'RELEASE SAVEPOINT forecourt_payload_link_repair')
    return {
      key: 'forecourt_payload_link_repairs',
      examined,
      compacted: repaired,
      skipped: policy.forecourtPayloadDryRun ? examined : 0,
      batches,
      oldestRemaining: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function compactForecourtPayloads(args: {
  client: PoolClient
  stationId: string
  policy: StorageRetentionPolicy
}): Promise<ForecourtPayloadCompactionTargetResult[]> {
  if (!args.policy.forecourtPayloadCompactionEnabled) return []

  const results: ForecourtPayloadCompactionTargetResult[] = [
    await repairForecourtPayloadLinks(args),
  ]
  for (const target of targets) {
    results.push(await compactTarget({ ...args, target }))
  }
  return results
}

export const forecourtPayloadCompactionTargetKeys = targets.map(
  (target) => target.key,
)
