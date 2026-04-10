import { queryOne } from '@/src/platform/db/postgres'

const sql = {
  upsertNormalizedBufferTransaction: `
    INSERT INTO transactions (
      id, station_id, customer_id, pump_number, transaction_date_time, total_amount, volume, fuel_type, pos_reference,
      status, allocated_at, allocated_by, fiscalization_reference, fiscalization_response, fiscalized_at,
      linking_window_expires_at, auto_fiscalized, retry_count, last_error, cloud_transaction_id, created_at, updated_at,
      deleted_at, source_queue_id, fiscal_queue_enqueued_at, fiscal_document_id, doms_source_system, doms_source_mode,
      doms_fp_id, doms_trans_seq_no, doms_payload_json, doms_first_seen_at, doms_last_seen_at, doms_reconciled_at
    )
    VALUES (
      $1, $2, NULL, $3, NOW(), $4, $5, NULL, $6, 'OPEN', NULL, NULL, NULL, NULL, NULL,
      NOW() + make_interval(secs => $7), FALSE, 0, NULL, NULL, NOW(), NOW(), NULL, NULL, NULL, NULL, 'jpl', $8, $9, $10, $11::jsonb, NOW(), NOW(), NOW()
    )
    ON CONFLICT (station_id, doms_source_mode, doms_fp_id, doms_trans_seq_no)
    WHERE doms_source_system = 'jpl'
      AND doms_trans_seq_no IS NOT NULL
      AND doms_fp_id IS NOT NULL
      AND doms_source_mode IS NOT NULL
    DO UPDATE SET
      total_amount = COALESCE(EXCLUDED.total_amount, transactions.total_amount),
      volume = COALESCE(EXCLUDED.volume, transactions.volume),
      doms_payload_json = EXCLUDED.doms_payload_json,
      doms_last_seen_at = NOW(),
      doms_reconciled_at = NOW(),
      updated_at = NOW()
    RETURNING id
  `,
} as const

export const forecourtJplTransactionsRepo = {
  async upsertNormalizedBufferTransaction(args: {
    id: string
    stationId: string
    pumpNumber: number
    totalAmount: number | null
    volume: number | null
    posReference: string
    linkingWindowSeconds: number
    sourceMode: 'supervised' | 'unsupervised'
    fpId: number
    transSeqNo: number
    payloadJson: Record<string, unknown>
  }) {
    return await queryOne<{ id: string }>(
      sql.upsertNormalizedBufferTransaction,
      [
        args.id,
        args.stationId,
        args.pumpNumber,
        args.totalAmount,
        args.volume,
        args.posReference,
        args.linkingWindowSeconds,
        args.sourceMode,
        args.fpId,
        args.transSeqNo,
        JSON.stringify(args.payloadJson),
      ],
    )
  },
}
