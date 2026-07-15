import { randomUUID } from 'crypto'
import type {
  DomsDynamicTankDataStatus,
  NormalizedDomsDynamicTankDataRequest,
} from '@/src/modules/forecourt/infrastructure/jpl/dynamicTankData'

import { query } from '@/src/platform/db/postgres'

export type DomsDynamicTankDataAuditRecord = {
  id: string
  station_id: string
  tank_id: string
  status: DomsDynamicTankDataStatus
  severity: string
  requested_by: string | null
  requested_role: string | null
  reason: string | null
  source: string | null
  validation_warnings_json: unknown
  request_json: unknown
  response_json: unknown
  error_text: string | null
  source_hash: string
  requested_at: Date
  sent_at: Date | null
  failed_at: Date | null
  updated_at: Date
}

const serializeError = (error: unknown) => {
  if (!error) return null
  if (error instanceof Error) return error.message
  return String(error)
}

export const forecourtJplDynamicTankDataRepo = {
  async recordRequested(args: {
    stationId: string
    request: NormalizedDomsDynamicTankDataRequest
    commandEnvelope?: unknown
  }) {
    const id = args.request.id || randomUUID()
    await query(
      `INSERT INTO forecourt_jpl_dynamic_tank_data_audit (
         id,
         station_id,
         tank_id,
         status,
         severity,
         requested_by,
         requested_role,
         reason,
         source,
         validation_warnings_json,
         request_json,
         source_hash,
         requested_at,
         updated_at
       ) VALUES (
         $1, $2, $3, 'requested', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, NOW(), NOW()
       )
       ON CONFLICT (station_id, source_hash) DO UPDATE SET
         status = 'requested',
         severity = EXCLUDED.severity,
         requested_by = EXCLUDED.requested_by,
         requested_role = EXCLUDED.requested_role,
         reason = EXCLUDED.reason,
         source = EXCLUDED.source,
         validation_warnings_json = EXCLUDED.validation_warnings_json,
         request_json = EXCLUDED.request_json,
         error_text = NULL,
         requested_at = NOW(),
         sent_at = NULL,
         failed_at = NULL,
         updated_at = NOW()`,
      [
        id,
        args.stationId,
        args.request.tankId,
        args.request.severity,
        args.request.requestedBy ?? null,
        args.request.requestedRole ?? null,
        args.request.reason ?? null,
        args.request.source ?? null,
        JSON.stringify(args.request.validationWarnings ?? []),
        JSON.stringify({
          payload: args.request.payloadJson,
          commandEnvelope: args.commandEnvelope ?? null,
        }),
        args.request.sourceHash,
      ],
    )
    return id
  },

  async markSent(args: {
    stationId: string
    sourceHash: string
    response?: unknown
  }) {
    await query(
      `UPDATE forecourt_jpl_dynamic_tank_data_audit
          SET status = 'sent',
              response_json = $3::jsonb,
              error_text = NULL,
              sent_at = NOW(),
              failed_at = NULL,
              updated_at = NOW()
        WHERE station_id = $1 AND source_hash = $2`,
      [args.stationId, args.sourceHash, JSON.stringify(args.response ?? null)],
    )
  },

  async markFailed(args: {
    stationId: string
    sourceHash: string
    error: unknown
    response?: unknown
  }) {
    await query(
      `UPDATE forecourt_jpl_dynamic_tank_data_audit
          SET status = 'failed',
              response_json = $3::jsonb,
              error_text = $4,
              failed_at = NOW(),
              updated_at = NOW()
        WHERE station_id = $1 AND source_hash = $2`,
      [
        args.stationId,
        args.sourceHash,
        JSON.stringify(args.response ?? null),
        serializeError(args.error),
      ],
    )
  },

  async listWorkflow(args: { stationId: string; limit?: number }) {
    const limit = Math.max(1, Math.min(Number(args.limit ?? 25), 100))
    const result = await query<DomsDynamicTankDataAuditRecord>(
      `SELECT *
         FROM forecourt_jpl_dynamic_tank_data_audit
        WHERE station_id = $1
        ORDER BY updated_at DESC
        LIMIT $2`,
      [args.stationId, limit],
    )

    return {
      totalRecent: result.rows.length,
      failedCount: result.rows.filter((row) => row.status === 'failed').length,
      warningCount: result.rows.filter((row) => row.severity !== 'info').length,
      recent: result.rows,
    }
  },
}
