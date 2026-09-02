import { queryOne } from '@/src/platform/db/postgres'

const sql = {
  updateNormalizedBufferTransaction: `
    UPDATE transactions txn
       SET total_amount = COALESCE($4, txn.total_amount),
           volume = COALESCE($5, txn.volume),
           doms_payload_json = $11::jsonb,
           doms_payload_cleared_at = NULL,
           doms_payload_clear_reason = NULL,
           doms_external_payment_reference = COALESCE($12, txn.doms_external_payment_reference),
           doms_ept_id = COALESCE($13, txn.doms_ept_id),
           doms_ept_sequence_no = COALESCE($14, txn.doms_ept_sequence_no),
           doms_ept_receipt_format_id = COALESCE($15, txn.doms_ept_receipt_format_id),
           doms_receipt_no = COALESCE($16, txn.doms_receipt_no),
           doms_card_label = COALESCE($17, txn.doms_card_label),
           doms_card_pan_masked = COALESCE($18, txn.doms_card_pan_masked),
           doms_last_seen_at = NOW(),
           doms_normalized_at = COALESCE(txn.doms_normalized_at, NOW()),
           doms_reconciled_at = NOW(),
           updated_at = NOW()
      FROM forecourt_jpl_transaction_checkpoints checkpoint
     WHERE checkpoint.station_id = $2
       AND checkpoint.source_mode = $8
       AND checkpoint.fp_id = $9
       AND checkpoint.trans_seq_no = $10
       AND checkpoint.normalized_transaction_id = txn.id
       AND txn.station_id = $2
       AND txn.doms_source_system = 'jpl'
     RETURNING txn.id
  `,
} as const

export const forecourtJplTransactionsRepo = {
  /**
   * Supplements the normalized transaction that the current checkpoint owns.
   * Do not upsert by (FpId, TransSeqNo): DOMS reuses DEC4 sequence numbers.
   */
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
    externalPaymentReference?: string | null
    eptId?: string | null
    eptSeqNo?: string | null
    eptReceiptFormatId?: string | null
    receiptNo?: string | null
    cardLabel?: string | null
    cardPanMasked?: string | null
  }) {
    return await queryOne<{ id: string }>(
      sql.updateNormalizedBufferTransaction,
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
        args.externalPaymentReference ?? null,
        args.eptId ?? null,
        args.eptSeqNo ?? null,
        args.eptReceiptFormatId ?? null,
        args.receiptNo ?? null,
        args.cardLabel ?? null,
        args.cardPanMasked ?? null,
      ],
    )
  },
}
