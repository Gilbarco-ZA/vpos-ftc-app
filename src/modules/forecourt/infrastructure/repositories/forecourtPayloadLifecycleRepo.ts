import { query } from '@/src/platform/db/postgres'

export const forecourtPayloadLifecycleRepo = {
  async markNormalizedOwner(args: {
    stationId: string
    sourceMode: 'supervised' | 'unsupervised'
    fpId: number
    transSeqNo: number
    transactionId: string
  }) {
    const ownerValues = [
      args.stationId,
      args.sourceMode,
      args.fpId,
      args.transSeqNo,
      args.transactionId,
    ]

    await query(
      `UPDATE transactions
          SET doms_normalized_at = COALESCE(doms_normalized_at, NOW()),
              doms_reconciled_at = COALESCE(doms_reconciled_at, NOW()),
              updated_at = NOW()
        WHERE station_id = $1
          AND id = $5
          AND doms_source_system = 'jpl'
          AND doms_source_mode = $2
          AND doms_fp_id = $3
          AND doms_trans_seq_no = $4`,
      ownerValues,
    )

    await query(
      `UPDATE forecourt_transactions
          SET source_mode = COALESCE(source_mode, $2),
              normalized_transaction_id = $5,
              normalized_at = COALESCE(normalized_at, NOW()),
              reconciled_at = COALESCE(reconciled_at, NOW())
        WHERE station_id = $1
          AND fp_id = $3
          AND trans_seq_no = $4
          AND COALESCE(source_mode, CASE WHEN is_supported THEN 'supervised' ELSE 'unsupervised' END) = $2
          AND (normalized_transaction_id IS NULL OR normalized_transaction_id = $5)`,
      ownerValues,
    )

    await query(
      `UPDATE forecourt_jpl_transaction_checkpoints
          SET normalized_transaction_id = $5,
              reconciled_at = COALESCE(reconciled_at, NOW()),
              updated_at = NOW()
        WHERE station_id = $1
          AND source_mode = $2
          AND fp_id = $3
          AND trans_seq_no = $4`,
      ownerValues,
    )

    if (args.sourceMode === 'supervised') {
      // Keep placeholders contiguous. PostgreSQL requires a determinable type
      // for every positional parameter up to the highest referenced index; a
      // skipped $2 with a referenced $5 fails at parse time even if the value
      // is present in the parameter array.
      await query(
        `UPDATE forecourt_jpl_supervised_replay
            SET normalized_transaction_id = $4,
                updated_at = NOW()
          WHERE station_id = $1
            AND fp_id = $2
            AND trans_seq_no = $3`,
        [args.stationId, args.fpId, args.transSeqNo, args.transactionId],
      )
    }
  },
}
