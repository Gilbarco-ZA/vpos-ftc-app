import type {
  NormalizedOptionalDeviceError,
  NormalizedOptionalDeviceSnapshot,
  NormalizedVendingTotals,
} from '@/src/modules/forecourt/infrastructure/jpl/optionalModules'

import { query, queryAll } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

const paramsJson = (value: unknown) => JSON.stringify(value ?? null)

const toPositiveLimit = (value: unknown, fallback = 25, max = 100) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

export type DomsOptionalModuleWorkflow = {
  snapshotSummary: Array<{
    device_family: string | null
    severity: string | null
    operational_status: string | null
    count: string
  }>
  errorSummary: Array<{
    device_family: string | null
    severity: string | null
    status: string | null
    count: string
  }>
  snapshots: any[]
  errors: any[]
  vendingTotals: any[]
  warningOrErrorCount: number
  openErrorCount: number
}

export const forecourtJplOptionalModulesRepo = {
  async upsertSnapshot(input: {
    stationId: string
    snapshot: NormalizedOptionalDeviceSnapshot | null | undefined
  }) {
    const snapshot = input.snapshot
    if (!snapshot?.deviceId) return null

    const result = await query<{ id: string }>(
      `INSERT INTO forecourt_jpl_optional_device_snapshots (
        id,
        station_id,
        device_family,
        device_id,
        source_message,
        source_sub_code,
        main_state,
        state_code,
        operational_status,
        severity,
        online,
        error_active,
        alarm_active,
        lock_id,
        protocol_id,
        device_label,
        status_json,
        flags_json,
        alarms_json,
        payload_json,
        source_hash,
        last_seen_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb,
        $21, NOW(), NOW()
      )
      ON CONFLICT (station_id, device_family, device_id)
      DO UPDATE SET
        source_message = EXCLUDED.source_message,
        source_sub_code = EXCLUDED.source_sub_code,
        main_state = COALESCE(EXCLUDED.main_state, forecourt_jpl_optional_device_snapshots.main_state),
        state_code = COALESCE(EXCLUDED.state_code, forecourt_jpl_optional_device_snapshots.state_code),
        operational_status = EXCLUDED.operational_status,
        severity = EXCLUDED.severity,
        online = EXCLUDED.online,
        error_active = EXCLUDED.error_active,
        alarm_active = EXCLUDED.alarm_active,
        lock_id = COALESCE(EXCLUDED.lock_id, forecourt_jpl_optional_device_snapshots.lock_id),
        protocol_id = COALESCE(EXCLUDED.protocol_id, forecourt_jpl_optional_device_snapshots.protocol_id),
        device_label = COALESCE(EXCLUDED.device_label, forecourt_jpl_optional_device_snapshots.device_label),
        status_json = EXCLUDED.status_json,
        flags_json = EXCLUDED.flags_json,
        alarms_json = EXCLUDED.alarms_json,
        payload_json = EXCLUDED.payload_json,
        source_hash = EXCLUDED.source_hash,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING id`,
      [
        uuidv4(),
        input.stationId,
        snapshot.family,
        snapshot.deviceId,
        snapshot.sourceMessage,
        snapshot.sourceSubCode ?? null,
        snapshot.mainState ?? null,
        snapshot.stateCode ?? null,
        snapshot.operationalStatus,
        snapshot.severity,
        snapshot.online ?? null,
        snapshot.errorActive ?? null,
        snapshot.alarmActive ?? null,
        snapshot.lockId ?? null,
        snapshot.protocolId ?? null,
        snapshot.label ?? null,
        paramsJson(snapshot.status),
        paramsJson(snapshot.flags),
        paramsJson(snapshot.alarms),
        paramsJson(snapshot.payloadJson),
        snapshot.sourceHash,
      ],
    )

    return result.rows[0] ?? null
  },

  async upsertError(input: {
    stationId: string
    error: NormalizedOptionalDeviceError | null | undefined
  }) {
    const error = input.error
    if (!error?.deviceId) return null

    const result = await query<{ id: string }>(
      `INSERT INTO forecourt_jpl_optional_device_errors (
        id,
        station_id,
        device_family,
        device_id,
        source_message,
        source_sub_code,
        error_code,
        error_name,
        error_text,
        error_date_and_time,
        protocol_id,
        severity,
        status,
        payload_json,
        source_hash,
        discovered_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, 'open', $13::jsonb, $14, NOW(), NOW()
      )
      ON CONFLICT (station_id, device_family, device_id, source_hash)
      DO UPDATE SET
        source_message = EXCLUDED.source_message,
        source_sub_code = EXCLUDED.source_sub_code,
        error_code = COALESCE(EXCLUDED.error_code, forecourt_jpl_optional_device_errors.error_code),
        error_name = COALESCE(EXCLUDED.error_name, forecourt_jpl_optional_device_errors.error_name),
        error_text = COALESCE(EXCLUDED.error_text, forecourt_jpl_optional_device_errors.error_text),
        error_date_and_time = COALESCE(EXCLUDED.error_date_and_time, forecourt_jpl_optional_device_errors.error_date_and_time),
        protocol_id = COALESCE(EXCLUDED.protocol_id, forecourt_jpl_optional_device_errors.protocol_id),
        severity = EXCLUDED.severity,
        status = CASE
          WHEN forecourt_jpl_optional_device_errors.status = 'closed' THEN 'reopened'
          ELSE forecourt_jpl_optional_device_errors.status
        END,
        payload_json = EXCLUDED.payload_json,
        updated_at = NOW()
      RETURNING id`,
      [
        uuidv4(),
        input.stationId,
        error.family,
        error.deviceId,
        error.sourceMessage,
        error.sourceSubCode ?? null,
        error.errorCode ?? null,
        error.errorName ?? null,
        error.errorText ?? null,
        error.errorDateAndTime ?? null,
        error.protocolId ?? null,
        error.severity,
        paramsJson(error.payloadJson),
        error.sourceHash,
      ],
    )

    return result.rows[0] ?? null
  },

  async upsertManyErrors(input: {
    stationId: string
    errors: Array<NormalizedOptionalDeviceError | null | undefined>
  }) {
    const results = []
    for (const error of input.errors) {
      const row = await this.upsertError({ stationId: input.stationId, error })
      if (row) results.push(row)
    }
    return results
  },

  async upsertVendingTotals(input: {
    stationId: string
    totals: NormalizedVendingTotals | null | undefined
  }) {
    const totals = input.totals
    if (!totals?.vmId) return null

    const result = await query<{ id: string }>(
      `INSERT INTO forecourt_jpl_vending_totals (
        id,
        station_id,
        vm_id,
        vm_total_type,
        vm_total_type_label,
        grand_count_total,
        grand_money_total,
        totals_info_json,
        items_json,
        payload_json,
        source_hash,
        captured_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, NOW(), NOW())
      ON CONFLICT (station_id, vm_id, vm_total_type, source_hash)
      DO UPDATE SET
        vm_total_type_label = COALESCE(EXCLUDED.vm_total_type_label, forecourt_jpl_vending_totals.vm_total_type_label),
        grand_count_total = COALESCE(EXCLUDED.grand_count_total, forecourt_jpl_vending_totals.grand_count_total),
        grand_money_total = COALESCE(EXCLUDED.grand_money_total, forecourt_jpl_vending_totals.grand_money_total),
        totals_info_json = EXCLUDED.totals_info_json,
        items_json = EXCLUDED.items_json,
        payload_json = EXCLUDED.payload_json,
        updated_at = NOW()
      RETURNING id`,
      [
        uuidv4(),
        input.stationId,
        totals.vmId,
        totals.vmTotalType ?? 'unknown',
        totals.vmTotalTypeLabel ?? null,
        totals.grandCountTotal ?? null,
        totals.grandMoneyTotal ?? null,
        paramsJson(totals.totalsInfo),
        paramsJson(totals.items),
        paramsJson(totals.payloadJson),
        totals.sourceHash,
      ],
    )

    return result.rows[0] ?? null
  },

  async listWorkflow(input: {
    stationId: string
    limit?: number
  }): Promise<DomsOptionalModuleWorkflow> {
    const limit = toPositiveLimit(input.limit, 25, 100)
    const [snapshotSummary, errorSummary, snapshots, errors, vendingTotals] =
      await Promise.all([
        queryAll<{
          device_family: string | null
          severity: string | null
          operational_status: string | null
          count: string
        }>(
          `SELECT device_family,
                  severity,
                  operational_status,
                  COUNT(*)::text AS count
             FROM forecourt_jpl_optional_device_snapshots
            WHERE station_id = $1
            GROUP BY device_family, severity, operational_status
            ORDER BY device_family ASC, severity ASC, operational_status ASC`,
          [input.stationId],
        ),
        queryAll<{
          device_family: string | null
          severity: string | null
          status: string | null
          count: string
        }>(
          `SELECT device_family,
                  severity,
                  status,
                  COUNT(*)::text AS count
             FROM forecourt_jpl_optional_device_errors
            WHERE station_id = $1
            GROUP BY device_family, severity, status
            ORDER BY device_family ASC, severity ASC, status ASC`,
          [input.stationId],
        ),
        queryAll<any>(
          `SELECT id,
                  device_family,
                  device_id,
                  source_message,
                  main_state,
                  operational_status,
                  severity,
                  online,
                  error_active,
                  alarm_active,
                  lock_id,
                  protocol_id,
                  device_label,
                  last_seen_at,
                  updated_at
             FROM forecourt_jpl_optional_device_snapshots
            WHERE station_id = $1
            ORDER BY updated_at DESC
            LIMIT $2`,
          [input.stationId, limit],
        ),
        queryAll<any>(
          `SELECT id,
                  device_family,
                  device_id,
                  source_message,
                  error_code,
                  error_name,
                  error_text,
                  severity,
                  status,
                  protocol_id,
                  error_date_and_time,
                  discovered_at,
                  updated_at
             FROM forecourt_jpl_optional_device_errors
            WHERE station_id = $1
              AND status IN ('open', 'reopened')
            ORDER BY
              CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              updated_at DESC
            LIMIT $2`,
          [input.stationId, limit],
        ),
        queryAll<any>(
          `SELECT id,
                  vm_id,
                  vm_total_type,
                  vm_total_type_label,
                  grand_count_total,
                  grand_money_total,
                  jsonb_array_length(items_json) AS item_count,
                  captured_at,
                  updated_at
             FROM forecourt_jpl_vending_totals
            WHERE station_id = $1
            ORDER BY updated_at DESC
            LIMIT $2`,
          [input.stationId, limit],
        ),
      ])

    const warningOrErrorCount = snapshots.filter((row: any) =>
      ['warning', 'error'].includes(String(row.severity)),
    ).length
    const openErrorCount = errors.length

    return {
      snapshotSummary,
      errorSummary,
      snapshots,
      errors,
      vendingTotals,
      warningOrErrorCount,
      openErrorCount,
    }
  },
}
