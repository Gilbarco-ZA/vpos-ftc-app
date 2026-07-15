import type {
  NormalizedJplWashBufferEntry,
  NormalizedJplWashTransaction,
} from '@/src/modules/forecourt/infrastructure/jpl/washTransactions'

import { query, queryAll } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

const UNKNOWN_SEQ = '0000'

const paramsJson = (value: unknown) => JSON.stringify(value ?? null)

export const forecourtJplWashTransactionsRepo = {
  async upsertDiscoveredBufferEntry(params: {
    stationId: string
    entry: NormalizedJplWashBufferEntry
  }) {
    if (!params.entry.wpId || !params.entry.transSeqNo) return null

    const result = await query<{ id: string }>(
      `INSERT INTO forecourt_jpl_wash_transactions (
        id,
        station_id,
        wp_id,
        wp_trans_seq_no,
        source_hash,
        sm_id,
        trans_lock_id,
        money,
        review_status,
        clear_status,
        payload_json,
        discovered_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_clear', $10::jsonb, NOW(), NOW())
      ON CONFLICT (station_id, wp_id, wp_trans_seq_no, source_hash)
      DO UPDATE SET
        sm_id = COALESCE(EXCLUDED.sm_id, forecourt_jpl_wash_transactions.sm_id),
        trans_lock_id = COALESCE(EXCLUDED.trans_lock_id, forecourt_jpl_wash_transactions.trans_lock_id),
        money = COALESCE(EXCLUDED.money, forecourt_jpl_wash_transactions.money),
        payload_json = COALESCE(EXCLUDED.payload_json, forecourt_jpl_wash_transactions.payload_json),
        updated_at = NOW()
      RETURNING id`,
      [
        uuidv4(),
        params.stationId,
        params.entry.wpId,
        params.entry.transSeqNo,
        params.entry.sourceHash,
        params.entry.smId ?? null,
        params.entry.transLockId ?? null,
        params.entry.money ?? null,
        params.entry.hasError ? 'needs_review' : 'pending_clear',
        paramsJson(params.entry.payloadJson),
      ],
    )

    return result.rows[0] ?? null
  },

  async upsertTransaction(params: {
    stationId: string
    transaction: NormalizedJplWashTransaction
  }) {
    const tx = params.transaction
    if (!tx.wpId) return null

    const result = await query<{ id: string }>(
      `INSERT INTO forecourt_jpl_wash_transactions (
        id,
        station_id,
        wp_id,
        wp_trans_seq_no,
        source_hash,
        pos_id,
        sm_id,
        trans_lock_id,
        money,
        wash_program_no,
        fc_wash_id,
        auth_id,
        start_date,
        start_time,
        finish_date,
        finish_time,
        termination_status_json,
        trans_error_code,
        wash_options_json,
        trans_return_data_json,
        clear_request_json,
        review_status,
        clear_status,
        last_error,
        payload_json,
        discovered_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16, $17::jsonb, $18, $19::jsonb, $20::jsonb, $21::jsonb,
        $22, $23, $24, $25::jsonb, NOW(), NOW()
      )
      ON CONFLICT (station_id, wp_id, wp_trans_seq_no, source_hash)
      DO UPDATE SET
        pos_id = COALESCE(EXCLUDED.pos_id, forecourt_jpl_wash_transactions.pos_id),
        sm_id = COALESCE(EXCLUDED.sm_id, forecourt_jpl_wash_transactions.sm_id),
        trans_lock_id = COALESCE(EXCLUDED.trans_lock_id, forecourt_jpl_wash_transactions.trans_lock_id),
        money = COALESCE(EXCLUDED.money, forecourt_jpl_wash_transactions.money),
        wash_program_no = COALESCE(EXCLUDED.wash_program_no, forecourt_jpl_wash_transactions.wash_program_no),
        fc_wash_id = COALESCE(EXCLUDED.fc_wash_id, forecourt_jpl_wash_transactions.fc_wash_id),
        auth_id = COALESCE(EXCLUDED.auth_id, forecourt_jpl_wash_transactions.auth_id),
        start_date = COALESCE(EXCLUDED.start_date, forecourt_jpl_wash_transactions.start_date),
        start_time = COALESCE(EXCLUDED.start_time, forecourt_jpl_wash_transactions.start_time),
        finish_date = COALESCE(EXCLUDED.finish_date, forecourt_jpl_wash_transactions.finish_date),
        finish_time = COALESCE(EXCLUDED.finish_time, forecourt_jpl_wash_transactions.finish_time),
        termination_status_json = COALESCE(EXCLUDED.termination_status_json, forecourt_jpl_wash_transactions.termination_status_json),
        trans_error_code = COALESCE(EXCLUDED.trans_error_code, forecourt_jpl_wash_transactions.trans_error_code),
        wash_options_json = COALESCE(EXCLUDED.wash_options_json, forecourt_jpl_wash_transactions.wash_options_json),
        trans_return_data_json = COALESCE(EXCLUDED.trans_return_data_json, forecourt_jpl_wash_transactions.trans_return_data_json),
        clear_request_json = COALESCE(EXCLUDED.clear_request_json, forecourt_jpl_wash_transactions.clear_request_json),
        review_status = EXCLUDED.review_status,
        clear_status = CASE
          WHEN forecourt_jpl_wash_transactions.clear_status = 'cleared' THEN forecourt_jpl_wash_transactions.clear_status
          ELSE EXCLUDED.clear_status
        END,
        last_error = EXCLUDED.last_error,
        payload_json = COALESCE(EXCLUDED.payload_json, forecourt_jpl_wash_transactions.payload_json),
        updated_at = NOW()
      RETURNING id`,
      [
        uuidv4(),
        params.stationId,
        tx.wpId,
        tx.transSeqNo ?? UNKNOWN_SEQ,
        tx.sourceHash,
        tx.posId ?? null,
        tx.smId ?? null,
        tx.transLockId ?? null,
        tx.money ?? null,
        tx.washProgramNo ?? null,
        tx.fcWashId ?? null,
        tx.authId ?? null,
        tx.startDate ?? null,
        tx.startTime ?? null,
        tx.finishDate ?? null,
        tx.finishTime ?? null,
        paramsJson(tx.terminationStatus),
        tx.transErrorCode ?? null,
        paramsJson(tx.washOptions),
        paramsJson([...tx.transReturnData, ...tx.transReturnData2]),
        paramsJson(tx.clearRequest),
        tx.reviewStatus,
        tx.clearStatus,
        tx.reason ?? null,
        paramsJson(tx.payloadJson),
      ],
    )

    return result.rows[0] ?? null
  },

  async listWorkflow(params: { stationId: string; limit?: number }) {
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25)))
    const [summary, recent, pendingClear, review] = await Promise.all([
      queryAll<{
        clear_status: string | null
        review_status: string | null
        count: string
      }>(
        `SELECT clear_status, review_status, COUNT(*)::text AS count
           FROM forecourt_jpl_wash_transactions
          WHERE station_id = $1
          GROUP BY clear_status, review_status
          ORDER BY clear_status, review_status`,
        [params.stationId],
      ),
      queryAll<any>(
        `SELECT id,
                wp_id,
                wp_trans_seq_no,
                pos_id,
                sm_id,
                trans_lock_id,
                money,
                wash_program_no,
                fc_wash_id,
                review_status,
                clear_status,
                clear_attempts,
                last_error,
                discovered_at,
                updated_at
           FROM forecourt_jpl_wash_transactions
          WHERE station_id = $1
          ORDER BY updated_at DESC
          LIMIT $2`,
        [params.stationId, limit],
      ),
      queryAll<any>(
        `SELECT id,
                wp_id,
                wp_trans_seq_no,
                pos_id,
                money,
                clear_request_json,
                review_status,
                updated_at
           FROM forecourt_jpl_wash_transactions
          WHERE station_id = $1
            AND clear_status = 'pending_clear'
          ORDER BY updated_at DESC
          LIMIT $2`,
        [params.stationId, limit],
      ),
      queryAll<any>(
        `SELECT id,
                wp_id,
                wp_trans_seq_no,
                pos_id,
                money,
                review_status,
                last_error,
                updated_at
           FROM forecourt_jpl_wash_transactions
          WHERE station_id = $1
            AND review_status <> 'pending_clear'
          ORDER BY updated_at DESC
          LIMIT $2`,
        [params.stationId, limit],
      ),
    ])

    return {
      summary,
      recent,
      pendingClear,
      review,
      pendingClearCount: pendingClear.length,
      reviewCount: review.length,
    }
  },
}
