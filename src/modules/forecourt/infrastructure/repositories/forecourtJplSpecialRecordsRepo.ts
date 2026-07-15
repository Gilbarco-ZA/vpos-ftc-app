import type {
  DomsBackOfficeRecord,
  DomsServiceMessageRecord,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecords'

import { query, queryAll } from '@/src/platform/db/postgres'

import {
  classifyDomsBackOfficeRecord,
  classifyDomsServiceMessage,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecordProcessing'

export type DomsSpecialRecordWorkflow = {
  serviceMessages: {
    summary: Array<{
      route_status: string | null
      route_severity: string | null
      route_key: string | null
      count: string
    }>
    recent: any[]
    reviewCount: number
    escalatedCount: number
  }
  backOfficeRecords: {
    summary: Array<{
      processing_status: string | null
      record_kind: string | null
      count: string
    }>
    recent: any[]
    replayCandidates: any[]
    pendingCount: number
    failedCount: number
  }
}

const sql = {
  upsertServiceMessage: `
    INSERT INTO forecourt_jpl_service_messages (
      station_id,
      fc_service_msg_seq_no,
      source_hash,
      message_text,
      payload_json,
      service_code,
      route_key,
      route_label,
      route_severity,
      route_status,
      route_summary,
      classified_at,
      status,
      collected_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW(), 'collected', NOW(), NOW())
    ON CONFLICT (station_id, fc_service_msg_seq_no, source_hash)
    DO UPDATE SET
      message_text = COALESCE(EXCLUDED.message_text, forecourt_jpl_service_messages.message_text),
      payload_json = COALESCE(EXCLUDED.payload_json, forecourt_jpl_service_messages.payload_json),
      service_code = COALESCE(EXCLUDED.service_code, forecourt_jpl_service_messages.service_code),
      route_key = COALESCE(EXCLUDED.route_key, forecourt_jpl_service_messages.route_key),
      route_label = COALESCE(EXCLUDED.route_label, forecourt_jpl_service_messages.route_label),
      route_severity = COALESCE(EXCLUDED.route_severity, forecourt_jpl_service_messages.route_severity),
      route_status = CASE
        WHEN forecourt_jpl_service_messages.route_status = 'escalated' THEN forecourt_jpl_service_messages.route_status
        ELSE COALESCE(EXCLUDED.route_status, forecourt_jpl_service_messages.route_status)
      END,
      route_summary = COALESCE(EXCLUDED.route_summary, forecourt_jpl_service_messages.route_summary),
      classified_at = COALESCE(forecourt_jpl_service_messages.classified_at, EXCLUDED.classified_at),
      status = CASE
        WHEN forecourt_jpl_service_messages.status = 'cleared' THEN forecourt_jpl_service_messages.status
        ELSE EXCLUDED.status
      END,
      collected_at = COALESCE(forecourt_jpl_service_messages.collected_at, EXCLUDED.collected_at),
      updated_at = NOW()
  `,
  markServiceMessageClearAttempt: `
    UPDATE forecourt_jpl_service_messages
       SET status = 'clear_requested',
           clear_attempted_at = NOW(),
           last_error = NULL,
           updated_at = NOW()
     WHERE station_id = $1
       AND fc_service_msg_seq_no = $2
       AND source_hash = $3
  `,
  markServiceMessageCleared: `
    UPDATE forecourt_jpl_service_messages
       SET status = 'cleared',
           clear_attempted_at = COALESCE(clear_attempted_at, NOW()),
           cleared_at = NOW(),
           last_error = NULL,
           updated_at = NOW()
     WHERE station_id = $1
       AND fc_service_msg_seq_no = $2
       AND source_hash = $3
  `,
  markServiceMessageFailed: `
    UPDATE forecourt_jpl_service_messages
       SET status = 'failed',
           clear_attempted_at = COALESCE(clear_attempted_at, NOW()),
           last_error = $4,
           updated_at = NOW()
     WHERE station_id = $1
       AND fc_service_msg_seq_no = $2
       AND source_hash = $3
  `,
  upsertBackOfficeRecord: `
    INSERT INTO forecourt_jpl_back_office_records (
      station_id,
      bor_seq_no,
      source_hash,
      bor_format_id,
      sub_code,
      bor_length,
      bor_data,
      payload_json,
      record_kind,
      record_label,
      processing_status,
      replay_required,
      status,
      collected_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, 'collected', NOW(), NOW())
    ON CONFLICT (station_id, bor_seq_no, source_hash)
    DO UPDATE SET
      bor_format_id = COALESCE(EXCLUDED.bor_format_id, forecourt_jpl_back_office_records.bor_format_id),
      sub_code = COALESCE(EXCLUDED.sub_code, forecourt_jpl_back_office_records.sub_code),
      bor_length = COALESCE(EXCLUDED.bor_length, forecourt_jpl_back_office_records.bor_length),
      bor_data = COALESCE(EXCLUDED.bor_data, forecourt_jpl_back_office_records.bor_data),
      payload_json = COALESCE(EXCLUDED.payload_json, forecourt_jpl_back_office_records.payload_json),
      record_kind = COALESCE(EXCLUDED.record_kind, forecourt_jpl_back_office_records.record_kind),
      record_label = COALESCE(EXCLUDED.record_label, forecourt_jpl_back_office_records.record_label),
      processing_status = CASE
        WHEN forecourt_jpl_back_office_records.processing_status IN ('processed', 'failed') THEN forecourt_jpl_back_office_records.processing_status
        ELSE COALESCE(EXCLUDED.processing_status, forecourt_jpl_back_office_records.processing_status)
      END,
      replay_required = COALESCE(EXCLUDED.replay_required, forecourt_jpl_back_office_records.replay_required),
      status = CASE
        WHEN forecourt_jpl_back_office_records.status = 'cleared' THEN forecourt_jpl_back_office_records.status
        ELSE EXCLUDED.status
      END,
      collected_at = COALESCE(forecourt_jpl_back_office_records.collected_at, EXCLUDED.collected_at),
      updated_at = NOW()
  `,
  markBackOfficeRecordClearAttempt: `
    UPDATE forecourt_jpl_back_office_records
       SET status = 'clear_requested',
           clear_attempted_at = NOW(),
           last_error = NULL,
           updated_at = NOW()
     WHERE station_id = $1
       AND bor_seq_no = $2
       AND source_hash = $3
  `,
  markBackOfficeRecordCleared: `
    UPDATE forecourt_jpl_back_office_records
       SET status = 'cleared',
           clear_attempted_at = COALESCE(clear_attempted_at, NOW()),
           cleared_at = NOW(),
           last_error = NULL,
           updated_at = NOW()
     WHERE station_id = $1
       AND bor_seq_no = $2
       AND source_hash = $3
  `,
  markBackOfficeRecordFailed: `
    UPDATE forecourt_jpl_back_office_records
       SET status = 'failed',
           clear_attempted_at = COALESCE(clear_attempted_at, NOW()),
           last_error = $4,
           updated_at = NOW()
     WHERE station_id = $1
       AND bor_seq_no = $2
       AND source_hash = $3
  `,
  markBackOfficeProcessingAttempt: `
    UPDATE forecourt_jpl_back_office_records
       SET processing_status = 'buffered',
           process_attempts = process_attempts + 1,
           next_process_at = NOW() + ($4::text || ' minutes')::interval,
           processing_error = NULL,
           last_replayed_at = NOW(),
           updated_at = NOW()
     WHERE station_id = $1
       AND bor_seq_no = $2
       AND source_hash = $3
  `,
  markBackOfficeProcessed: `
    UPDATE forecourt_jpl_back_office_records
       SET processing_status = 'processed',
           processed_at = NOW(),
           processing_error = NULL,
           updated_at = NOW()
     WHERE station_id = $1
       AND bor_seq_no = $2
       AND source_hash = $3
  `,
  markBackOfficeProcessingFailed: `
    UPDATE forecourt_jpl_back_office_records
       SET processing_status = 'failed',
           process_attempts = process_attempts + 1,
           processing_error = $4,
           updated_at = NOW()
     WHERE station_id = $1
       AND bor_seq_no = $2
       AND source_hash = $3
  `,
} as const

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? 'Unknown error')

const toPositiveLimit = (value: unknown, fallback = 25, max = 100) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

export const forecourtJplSpecialRecordsRepo = {
  async upsertServiceMessage(record: DomsServiceMessageRecord) {
    const classification = classifyDomsServiceMessage(record)
    await query(sql.upsertServiceMessage, [
      record.stationId,
      record.seqNo ?? null,
      record.sourceHash,
      record.message ?? null,
      record.payloadJson != null ? JSON.stringify(record.payloadJson) : null,
      classification.serviceCode ?? null,
      classification.routeKey,
      classification.routeLabel,
      classification.severity,
      classification.routeStatus,
      classification.summary,
    ])
  },

  async markServiceMessageClearAttempt(record: DomsServiceMessageRecord) {
    if (!record.seqNo) return
    await query(sql.markServiceMessageClearAttempt, [
      record.stationId,
      record.seqNo,
      record.sourceHash,
    ])
  },

  async markServiceMessageCleared(record: DomsServiceMessageRecord) {
    if (!record.seqNo) return
    await query(sql.markServiceMessageCleared, [
      record.stationId,
      record.seqNo,
      record.sourceHash,
    ])
  },

  async markServiceMessageFailed(
    record: DomsServiceMessageRecord,
    error: unknown,
  ) {
    if (!record.seqNo) return
    await query(sql.markServiceMessageFailed, [
      record.stationId,
      record.seqNo,
      record.sourceHash,
      errorMessage(error),
    ])
  },

  async upsertBackOfficeRecord(record: DomsBackOfficeRecord) {
    const classification = classifyDomsBackOfficeRecord(record)
    await query(sql.upsertBackOfficeRecord, [
      record.stationId,
      record.seqNo ?? null,
      record.sourceHash,
      record.formatId ?? null,
      record.subCode,
      record.borLength,
      record.borData ?? null,
      JSON.stringify(record.payloadJson ?? {}),
      classification.recordKind,
      classification.recordLabel,
      classification.processingStatus,
      classification.shouldReplay,
    ])
  },

  async markBackOfficeRecordClearAttempt(record: DomsBackOfficeRecord) {
    if (!record.seqNo) return
    await query(sql.markBackOfficeRecordClearAttempt, [
      record.stationId,
      record.seqNo,
      record.sourceHash,
    ])
  },

  async markBackOfficeRecordCleared(record: DomsBackOfficeRecord) {
    if (!record.seqNo) return
    await query(sql.markBackOfficeRecordCleared, [
      record.stationId,
      record.seqNo,
      record.sourceHash,
    ])
  },

  async markBackOfficeRecordFailed(
    record: DomsBackOfficeRecord,
    error: unknown,
  ) {
    if (!record.seqNo) return
    await query(sql.markBackOfficeRecordFailed, [
      record.stationId,
      record.seqNo,
      record.sourceHash,
      errorMessage(error),
    ])
  },

  async markBackOfficeProcessingAttempt(input: {
    stationId: string
    borSeqNo: string
    sourceHash: string
    retryDelayMinutes?: number
  }) {
    await query(sql.markBackOfficeProcessingAttempt, [
      input.stationId,
      input.borSeqNo,
      input.sourceHash,
      toPositiveLimit(input.retryDelayMinutes, 15, 24 * 60),
    ])
  },

  async markBackOfficeProcessed(input: {
    stationId: string
    borSeqNo: string
    sourceHash: string
  }) {
    await query(sql.markBackOfficeProcessed, [
      input.stationId,
      input.borSeqNo,
      input.sourceHash,
    ])
  },

  async markBackOfficeProcessingFailed(input: {
    stationId: string
    borSeqNo: string
    sourceHash: string
    error: unknown
  }) {
    await query(sql.markBackOfficeProcessingFailed, [
      input.stationId,
      input.borSeqNo,
      input.sourceHash,
      errorMessage(input.error),
    ])
  },

  async listWorkflow(input: {
    stationId: string
    limit?: number
  }): Promise<DomsSpecialRecordWorkflow> {
    const limit = toPositiveLimit(input.limit, 25, 100)
    const [serviceSummary, serviceRows, borSummary, borRows, replayRows] =
      await Promise.all([
        queryAll<{
          route_status: string | null
          route_severity: string | null
          route_key: string | null
          count: string
        }>(
          `SELECT route_status, route_severity, route_key, COUNT(*)::text AS count
             FROM forecourt_jpl_service_messages
            WHERE station_id = $1
            GROUP BY route_status, route_severity, route_key
            ORDER BY route_status ASC, route_severity ASC, route_key ASC`,
          [input.stationId],
        ),
        queryAll(
          `SELECT fc_service_msg_seq_no,
                  message_text,
                  service_code,
                  route_key,
                  route_label,
                  route_severity,
                  route_status,
                  route_summary,
                  status,
                  collected_at,
                  cleared_at,
                  last_error,
                  updated_at
             FROM forecourt_jpl_service_messages
            WHERE station_id = $1
            ORDER BY collected_at DESC
            LIMIT $2`,
          [input.stationId, limit],
        ),
        queryAll<{
          processing_status: string | null
          record_kind: string | null
          count: string
        }>(
          `SELECT processing_status, record_kind, COUNT(*)::text AS count
             FROM forecourt_jpl_back_office_records
            WHERE station_id = $1
            GROUP BY processing_status, record_kind
            ORDER BY processing_status ASC, record_kind ASC`,
          [input.stationId],
        ),
        queryAll(
          `SELECT bor_seq_no,
                  bor_format_id,
                  sub_code,
                  bor_length,
                  record_kind,
                  record_label,
                  processing_status,
                  process_attempts,
                  replay_required,
                  status,
                  collected_at,
                  cleared_at,
                  processed_at,
                  next_process_at,
                  processing_error,
                  updated_at
             FROM forecourt_jpl_back_office_records
            WHERE station_id = $1
            ORDER BY collected_at DESC
            LIMIT $2`,
          [input.stationId, limit],
        ),
        queryAll(
          `SELECT bor_seq_no,
                  bor_format_id,
                  sub_code,
                  record_kind,
                  record_label,
                  processing_status,
                  process_attempts,
                  replay_required,
                  collected_at,
                  next_process_at,
                  processing_error,
                  source_hash
             FROM forecourt_jpl_back_office_records
            WHERE station_id = $1
              AND replay_required IS TRUE
              AND processing_status IN ('pending', 'buffered', 'failed')
            ORDER BY
              CASE processing_status WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
              COALESCE(next_process_at, collected_at) ASC
            LIMIT $2`,
          [input.stationId, limit],
        ),
      ])

    const reviewCount = serviceRows.filter((row: any) =>
      ['needs_review', 'escalated'].includes(String(row.route_status)),
    ).length
    const escalatedCount = serviceRows.filter(
      (row: any) => String(row.route_status) === 'escalated',
    ).length
    const pendingCount = replayRows.filter((row: any) =>
      ['pending', 'buffered'].includes(String(row.processing_status)),
    ).length
    const failedCount = replayRows.filter(
      (row: any) => String(row.processing_status) === 'failed',
    ).length

    return {
      serviceMessages: {
        summary: serviceSummary,
        recent: serviceRows,
        reviewCount,
        escalatedCount,
      },
      backOfficeRecords: {
        summary: borSummary,
        recent: borRows,
        replayCandidates: replayRows,
        pendingCount,
        failedCount,
      },
    }
  },
}
