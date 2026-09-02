import type { StorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'

export type StorageRetentionTarget = {
  key: string
  table: string
  alias: string
  idColumn: string
  candidateSelectSql?: string
  candidateOrderSql?: string
  deleteMatchSql?: string
  returningSql?: string
  timestampSql: string
  stationPredicateSql: string
  eligibilitySql: string
  retentionDays: number
}

const fiscalInboxTransactionUuidSql = `CASE
  WHEN NULLIF(fi.message_json->>'transactionId', '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN (fi.message_json->>'transactionId')::uuid
  ELSE NULL
END`

export function buildStorageRetentionTargets(
  policy: StorageRetentionPolicy,
): StorageRetentionTarget[] {
  return [
    {
      key: 'print_jobs_done',
      table: 'print_jobs',
      alias: 'pj',
      idColumn: 'id',
      timestampSql: 'pj.completed_at',
      stationPredicateSql: 'pj.station_id = $1::uuid',
      eligibilitySql: `pj.status = 'DONE'
        AND pj.completed_at IS NOT NULL
        AND (
          (pj.source_transaction_id IS NOT NULL AND EXISTS (
            SELECT 1
              FROM receipts receipt
             WHERE receipt.station_id = pj.station_id
               AND receipt.transaction_id = pj.source_transaction_id
          ))
          OR
          (pj.source_report_id IS NOT NULL AND EXISTS (
            SELECT 1
              FROM reports report
             WHERE report.station_id = pj.station_id
               AND report.id = pj.source_report_id
          ))
        )`,
      retentionDays: policy.printDoneDays,
    },
    {
      key: 'print_jobs_failed',
      table: 'print_jobs',
      alias: 'pj',
      idColumn: 'id',
      timestampSql: 'pj.completed_at',
      stationPredicateSql: 'pj.station_id = $1::uuid',
      eligibilitySql: `pj.status = 'FAILED'
        AND pj.completed_at IS NOT NULL`,
      retentionDays: policy.printFailedDays,
    },
    {
      key: 'transaction_queue_done',
      table: 'transaction_queue',
      alias: 'tq',
      idColumn: 'id',
      timestampSql: 'tq.updated_at',
      stationPredicateSql: 'tq.station_id = $1::uuid',
      eligibilitySql: `tq.status = 'DONE'
        AND EXISTS (
          SELECT 1
            FROM transactions txn
           WHERE txn.station_id = tq.station_id
             AND (
               txn.id = tq.transaction_id
               OR txn.source_queue_id = tq.id
             )
        )`,
      retentionDays: policy.transactionQueueDoneDays,
    },
    {
      key: 'transaction_queue_failed',
      table: 'transaction_queue',
      alias: 'tq',
      idColumn: 'id',
      timestampSql: 'tq.updated_at',
      stationPredicateSql: 'tq.station_id = $1::uuid',
      eligibilitySql: `tq.status = 'FAILED'
        AND tq.next_attempt_at IS NULL`,
      retentionDays: policy.transactionQueueFailedDays,
    },
    {
      key: 'report_queue_done',
      table: 'report_queue',
      alias: 'rq',
      idColumn: 'id',
      timestampSql: 'rq.updated_at',
      stationPredicateSql: 'rq.station_id = $1::uuid',
      eligibilitySql: `rq.status = 'DONE'
        AND EXISTS (
          SELECT 1
            FROM reports report
           WHERE report.station_id = rq.station_id
             AND report.source_queue_id = rq.id
        )`,
      retentionDays: policy.reportQueueDoneDays,
    },
    {
      key: 'report_queue_failed',
      table: 'report_queue',
      alias: 'rq',
      idColumn: 'id',
      timestampSql: 'rq.updated_at',
      stationPredicateSql: 'rq.station_id = $1::uuid',
      eligibilitySql: `rq.status = 'FAILED'
        AND rq.next_attempt_at IS NULL`,
      retentionDays: policy.reportQueueFailedDays,
    },
    {
      key: 'fiscal_inbox_processed',
      table: 'fiscal_inbox',
      alias: 'fi',
      idColumn: 'id',
      timestampSql: 'fi.processed_at',
      stationPredicateSql: 'fi.station_id = $1::text',
      eligibilitySql: `fi.status = 'PROCESSED'
        AND fi.processed_at IS NOT NULL
        AND (
          NULLIF(fi.message_json->>'transactionId', '') IS NULL
          OR EXISTS (
            SELECT 1
              FROM transactions txn
             WHERE txn.station_id::text = fi.station_id::text
               AND txn.id = ${fiscalInboxTransactionUuidSql}
          )
        )
        AND (
          NULLIF(fi.message_json->>'transactionId', '') IS NULL
          OR (
            fi.topic NOT IN ('fiscal', 'external_fiscalization')
            AND COALESCE(fi.message_json->>'type', '') NOT ILIKE '%fiscal%'
          )
          OR EXISTS (
            SELECT 1
              FROM fiscalization_events fiscal_event
             WHERE fiscal_event.station_id::text = fi.station_id::text
               AND fiscal_event.transaction_id = ${fiscalInboxTransactionUuidSql}
          )
        )`,
      retentionDays: policy.fiscalInboxProcessedDays,
    },
    {
      key: 'fiscal_inbox_resolved_dead',
      table: 'fiscal_inbox',
      alias: 'fi',
      idColumn: 'id',
      timestampSql: 'fi.resolved_at',
      stationPredicateSql: 'fi.station_id = $1::text',
      eligibilitySql: `fi.status = 'DEAD'
        AND fi.resolved_at IS NOT NULL`,
      retentionDays: policy.fiscalInboxResolvedDeadDays,
    },
    {
      key: 'pss_xml_parsed_duplicate',
      table: 'station_kv',
      alias: 'kv',
      idColumn: 'key',
      candidateSelectSql: `kv.station_id AS candidate_station_id,
        kv.key AS candidate_key`,
      candidateOrderSql: `COALESCE((
        SELECT summary.updated_at
          FROM station_kv summary
         WHERE summary.station_id = kv.station_id
           AND summary.key = 'pss.xml.importSummary'
         LIMIT 1
      ), kv.updated_at), kv.key`,
      deleteMatchSql: `target.station_id = candidates.candidate_station_id
        AND target.key = candidates.candidate_key`,
      returningSql: `target.station_id::text || ':' || target.key AS id`,
      timestampSql: `COALESCE((
        SELECT summary.updated_at
          FROM station_kv summary
         WHERE summary.station_id = kv.station_id
           AND summary.key = 'pss.xml.importSummary'
         LIMIT 1
      ), kv.updated_at)`,
      stationPredicateSql: 'kv.station_id = $1::uuid',
      eligibilitySql: `kv.key = 'pss.xml.parsed'
        AND kv.value IS NOT NULL
        AND kv.value <> 'null'::jsonb
        AND EXISTS (
          SELECT 1
            FROM station_kv summary
           WHERE summary.station_id = kv.station_id
             AND summary.key = 'pss.xml.importSummary'
             AND summary.value IS NOT NULL
             AND summary.value <> 'null'::jsonb
        )
        AND EXISTS (
          SELECT 1
            FROM station_kv raw_xml
           WHERE raw_xml.station_id = kv.station_id
             AND raw_xml.key = 'pss.xml.raw'
             AND raw_xml.value IS NOT NULL
             AND raw_xml.value <> 'null'::jsonb
        )
        AND EXISTS (
          SELECT 1
            FROM station_kv id_map
           WHERE id_map.station_id = kv.station_id
             AND id_map.key = 'pss.xml.idMap'
             AND id_map.value IS NOT NULL
             AND id_map.value <> 'null'::jsonb
        )`,
      retentionDays: policy.pssParsedCompatibilityDays,
    },
    {
      key: 'audit_logs',
      table: 'audit_logs',
      alias: 'audit',
      idColumn: 'id',
      timestampSql: 'audit.created_at',
      stationPredicateSql: 'audit.station_id = $1::uuid',
      eligibilitySql: 'TRUE',
      retentionDays: policy.auditLogDays,
    },
    {
      key: 'vpos_logs',
      table: 'vpos_logs',
      alias: 'log',
      idColumn: 'id',
      timestampSql: 'log.updated_at',
      stationPredicateSql: 'log.station_id = $1::uuid',
      eligibilitySql: 'TRUE',
      retentionDays: policy.vposLogDays,
    },
    {
      key: 'jpl_supervised_replay_cleared',
      table: 'forecourt_jpl_supervised_replay',
      alias: 'replay',
      idColumn: 'trans_seq_no',
      candidateSelectSql: `replay.station_id AS candidate_station_id,
        replay.fp_id AS candidate_fp_id,
        replay.trans_seq_no AS candidate_trans_seq_no`,
      candidateOrderSql: `replay.terminal_at,
        replay.fp_id,
        replay.trans_seq_no`,
      deleteMatchSql: `target.station_id = candidates.candidate_station_id
        AND target.fp_id = candidates.candidate_fp_id
        AND target.trans_seq_no = candidates.candidate_trans_seq_no`,
      returningSql: `target.station_id::text || ':supervised:' ||
        target.fp_id::text || ':' || target.trans_seq_no::text AS id`,
      timestampSql: 'replay.terminal_at',
      stationPredicateSql: 'replay.station_id = $1::uuid',
      eligibilitySql: `replay.replay_stage = 'cleared'
        AND replay.terminal_at IS NOT NULL
        AND replay.terminal_outcome = 'cleared'
        AND replay.last_error IS NULL
        AND replay.payload_cleared_at IS NOT NULL
        AND replay.read_payload_json IS NULL
        AND replay.clear_fields_json IS NULL
        AND replay.normalized_transaction_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM transactions txn
           WHERE txn.id = replay.normalized_transaction_id
             AND txn.station_id = replay.station_id
             AND txn.doms_cleared_at IS NOT NULL
             AND txn.doms_payload_cleared_at IS NOT NULL
        )`,
      retentionDays: policy.jplSupervisedReplayClearedDays,
    },
    {
      key: 'jpl_transaction_checkpoints_cleared',
      table: 'forecourt_jpl_transaction_checkpoints',
      alias: 'checkpoint',
      idColumn: 'trans_seq_no',
      candidateSelectSql: `checkpoint.station_id AS candidate_station_id,
        checkpoint.source_mode AS candidate_source_mode,
        checkpoint.fp_id AS candidate_fp_id,
        checkpoint.trans_seq_no AS candidate_trans_seq_no`,
      candidateOrderSql: `checkpoint.terminal_at,
        checkpoint.source_mode,
        checkpoint.fp_id,
        checkpoint.trans_seq_no`,
      deleteMatchSql: `target.station_id = candidates.candidate_station_id
        AND target.source_mode = candidates.candidate_source_mode
        AND target.fp_id = candidates.candidate_fp_id
        AND target.trans_seq_no = candidates.candidate_trans_seq_no`,
      returningSql: `target.station_id::text || ':' || target.source_mode || ':' ||
        target.fp_id::text || ':' || target.trans_seq_no::text AS id`,
      timestampSql: 'checkpoint.terminal_at',
      stationPredicateSql: 'checkpoint.station_id = $1::uuid',
      eligibilitySql: `checkpoint.lifecycle_stage = 'cleared'
        AND checkpoint.terminal_at IS NOT NULL
        AND checkpoint.terminal_outcome = 'cleared'
        AND checkpoint.blocked_by_foreign_pos = FALSE
        AND checkpoint.last_error IS NULL
        AND checkpoint.payload_cleared_at IS NOT NULL
        AND checkpoint.read_payload_json IS NULL
        AND checkpoint.clear_payload_json IS NULL
        AND checkpoint.normalized_transaction_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM transactions txn
           WHERE txn.id = checkpoint.normalized_transaction_id
             AND txn.station_id = checkpoint.station_id
             AND txn.doms_cleared_at IS NOT NULL
             AND txn.doms_payload_cleared_at IS NOT NULL
        )`,
      retentionDays: policy.jplCheckpointClearedDays,
    },
    {
      key: 'forecourt_events_routine',
      table: 'forecourt_events',
      alias: 'fe',
      idColumn: 'id',
      timestampSql: 'fe.occurred_at',
      stationPredicateSql: 'fe.station_id = $1::uuid',
      eligibilitySql: `fe.retention_class = 'routine'`,
      retentionDays: policy.forecourtRoutineEventDays,
    },
    {
      key: 'forecourt_events_error',
      table: 'forecourt_events',
      alias: 'fe',
      idColumn: 'id',
      timestampSql: 'fe.occurred_at',
      stationPredicateSql: 'fe.station_id = $1::uuid',
      eligibilitySql: `fe.retention_class = 'error'`,
      retentionDays: policy.forecourtErrorEventDays,
    },
    {
      key: 'forecourt_events_maintenance_security',
      table: 'forecourt_events',
      alias: 'fe',
      idColumn: 'id',
      timestampSql: 'fe.occurred_at',
      stationPredicateSql: 'fe.station_id = $1::uuid',
      eligibilitySql: `fe.retention_class = 'maintenance_security'`,
      retentionDays: policy.forecourtMaintenanceSecurityEventDays,
    },
    {
      key: 'forecourt_events_field_evidence',
      table: 'forecourt_events',
      alias: 'fe',
      idColumn: 'id',
      timestampSql: 'fe.occurred_at',
      stationPredicateSql: 'fe.station_id = $1::uuid',
      eligibilitySql: `fe.retention_class = 'field_evidence'`,
      retentionDays: policy.forecourtFieldEvidenceEventDays,
    },
  ]
}
