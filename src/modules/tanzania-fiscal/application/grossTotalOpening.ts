import {
  query,
  queryOne,
  txQuery,
  withTransaction,
} from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import type { TanzaniaReceiptVerificationPrefixMode } from '../domain/receiptVerificationPrefix'
import { calculateTanzaniaGrossTotal } from '../domain/grossTotal'
import {
  DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE,
  normalizeTanzaniaReceiptVerificationPrefixOverride,
  resolveTanzaniaReceiptVerificationPrefix,
} from '../domain/receiptVerificationPrefix'

type GrossTotalRow = {
  opening_gross_total: string | number | null
  local_fiscal_turnover: string | number | null
  opening_gross_total_captured_at: string | Date | null
  daily_counter: string | number | null
  global_counter: string | number | null
  daily_counter_date: string | null
  device_id_override: string | null
  receipt_verification_prefix_mode: TanzaniaReceiptVerificationPrefixMode | null
  receipt_verification_prefix_override: string | null
}

export type TanzaniaGrossTotalSummary = {
  openingGrossTotal: number
  localFiscalTurnover: number
  effectiveGrossTotal: number
  openingGrossTotalCaptured: boolean
  openingGrossTotalCapturedAt: string | null
  dailyCounter: number
  globalCounter: number
  dailyCounterDate: string | null
  deviceIdOverride: string | null
  receiptVerificationPrefixMode: TanzaniaReceiptVerificationPrefixMode
  receiptVerificationPrefixOverride: string | null
  effectiveReceiptVerificationPrefix: string
}

export type TanzaniaFiscalOpeningValues = {
  openingGrossTotal: number
  dailyCounter?: number
  globalCounter?: number
  deviceIdOverride?: string | null
  receiptVerificationPrefixMode?: TanzaniaReceiptVerificationPrefixMode
  receiptVerificationPrefixOverride?: string | null
}

const money = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}

const counter = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export async function getTanzaniaGrossTotalSummary(
  stationId: string,
): Promise<TanzaniaGrossTotalSummary> {
  const row = await queryOne<GrossTotalRow>(
    `WITH station_context AS (
       SELECT COALESCE(
                NULLIF(BTRIM(fs.timezone), ''),
                'Africa/Dar_es_Salaam'
              ) AS timezone
         FROM fuel_stations fs
        WHERE fs.id = $1::uuid
     ),
     counter_context AS (
       SELECT TO_CHAR(
                CURRENT_TIMESTAMP AT TIME ZONE sc.timezone,
                'YYYY-MM-DD'
              ) AS daily_counter_date,
              'receipt:' || TO_CHAR(
                CURRENT_TIMESTAMP AT TIME ZONE sc.timezone,
                'YYYYMMDD'
              ) AS daily_counter_key
         FROM station_context sc
     )
     SELECT COALESCE(
              (SELECT ss.tanzania_gross_total_opening
                 FROM station_settings ss
                WHERE ss.station_id = $1::uuid),
              0
            ) AS opening_gross_total,
            (SELECT ss.tanzania_gross_total_opening_captured_at
               FROM station_settings ss
              WHERE ss.station_id = $1::uuid) AS opening_gross_total_captured_at,
            COALESCE(SUM(t.total_amount), 0) AS local_fiscal_turnover,
            COALESCE(
              (SELECT tc.counter_value
                 FROM tanzania_fiscal_counters tc
                WHERE tc.station_id = $1::uuid
                  AND tc.counter_key = 'receipt:global'),
              0
            ) AS global_counter,
            COALESCE(
              (SELECT tc.counter_value
                 FROM tanzania_fiscal_counters tc
                WHERE tc.station_id = $1::uuid
                  AND tc.counter_key = cc.daily_counter_key),
              0
            ) AS daily_counter,
            cc.daily_counter_date,
            (SELECT NULLIF(BTRIM(ss.tanzania_device_id_override), '')
               FROM station_settings ss
              WHERE ss.station_id = $1::uuid) AS device_id_override,
            (SELECT ss.tanzania_receipt_verification_prefix_mode
               FROM station_settings ss
              WHERE ss.station_id = $1::uuid) AS receipt_verification_prefix_mode,
            (SELECT ss.tanzania_receipt_verification_prefix_override
               FROM station_settings ss
              WHERE ss.station_id = $1::uuid) AS receipt_verification_prefix_override
       FROM counter_context cc
       LEFT JOIN transactions t
         ON t.station_id = $1::uuid
        AND t.deleted_at IS NULL
        AND t.status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')
      GROUP BY cc.daily_counter_date, cc.daily_counter_key`,
    [stationId],
  )

  const openingGrossTotal = money(row?.opening_gross_total)
  const localFiscalTurnover = money(row?.local_fiscal_turnover)

  const capturedAt = row?.opening_gross_total_captured_at
    ? new Date(row.opening_gross_total_captured_at).toISOString()
    : null
  const receiptVerificationPrefixMode =
    row?.receipt_verification_prefix_mode ??
    DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE
  const receiptVerificationPrefixOverride =
    row?.receipt_verification_prefix_override ?? null

  return {
    openingGrossTotal,
    localFiscalTurnover,
    openingGrossTotalCaptured: capturedAt != null,
    openingGrossTotalCapturedAt: capturedAt,
    effectiveGrossTotal: calculateTanzaniaGrossTotal(
      openingGrossTotal,
      localFiscalTurnover,
    ),
    dailyCounter: counter(row?.daily_counter),
    globalCounter: counter(row?.global_counter),
    dailyCounterDate: row?.daily_counter_date ?? null,
    deviceIdOverride: row?.device_id_override ?? null,
    receiptVerificationPrefixMode,
    receiptVerificationPrefixOverride,
    effectiveReceiptVerificationPrefix:
      resolveTanzaniaReceiptVerificationPrefix({
        mode: receiptVerificationPrefixMode,
        override: receiptVerificationPrefixOverride,
      }),
  }
}

export async function setTanzaniaGrossTotalOpening(
  stationId: string,
  openingGrossTotal: number,
): Promise<TanzaniaGrossTotalSummary> {
  await query(
    `INSERT INTO station_settings (
       id, station_id, tanzania_gross_total_opening,
       tanzania_gross_total_opening_captured_at
     ) VALUES ($1::uuid, $2::uuid, $3, NOW())
     ON CONFLICT (station_id)
     DO UPDATE SET tanzania_gross_total_opening = EXCLUDED.tanzania_gross_total_opening,
                   tanzania_gross_total_opening_captured_at = NOW(),
                   updated_at = NOW()`,
    [uuidv4(), stationId, openingGrossTotal],
  )

  return await getTanzaniaGrossTotalSummary(stationId)
}

export async function setTanzaniaFiscalOpeningValues(
  stationId: string,
  values: TanzaniaFiscalOpeningValues,
): Promise<TanzaniaGrossTotalSummary> {
  const shouldUpdateReceiptPrefix =
    values.receiptVerificationPrefixMode !== undefined ||
    values.receiptVerificationPrefixOverride !== undefined
  if (
    values.receiptVerificationPrefixOverride !== undefined &&
    values.receiptVerificationPrefixMode === undefined
  ) {
    throw new Error(
      'Receipt verification prefix mode is required when updating the override.',
    )
  }
  const receiptVerificationPrefixMode =
    values.receiptVerificationPrefixMode ??
    DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE
  const receiptVerificationPrefixOverride =
    values.receiptVerificationPrefixOverride === undefined
      ? null
      : normalizeTanzaniaReceiptVerificationPrefixOverride(
          values.receiptVerificationPrefixOverride,
        )
  if (shouldUpdateReceiptPrefix) {
    resolveTanzaniaReceiptVerificationPrefix({
      mode: receiptVerificationPrefixMode,
      override: receiptVerificationPrefixOverride,
    })
  }

  await withTransaction(async (client) => {
    const counterContext = await txQuery<{ daily_counter_key: string }>(
      client,
      `SELECT 'receipt:' || TO_CHAR(
                CURRENT_TIMESTAMP AT TIME ZONE COALESCE(
                  NULLIF(BTRIM(fs.timezone), ''),
                  'Africa/Dar_es_Salaam'
                ),
                'YYYYMMDD'
              ) AS daily_counter_key
         FROM fuel_stations fs
        WHERE fs.id = $1::uuid
        LIMIT 1`,
      [stationId],
    )
    const dailyCounterKey = counterContext.rows?.[0]?.daily_counter_key
    if (!dailyCounterKey) {
      throw new Error(`Station ${stationId} not found`)
    }

    await txQuery(
      client,
      `INSERT INTO station_settings (
         id, station_id, tanzania_gross_total_opening,
         tanzania_gross_total_opening_captured_at
       ) VALUES ($1::uuid, $2::uuid, $3, NOW())
       ON CONFLICT (station_id)
       DO UPDATE SET tanzania_gross_total_opening = EXCLUDED.tanzania_gross_total_opening,
                     tanzania_gross_total_opening_captured_at = NOW(),
                     updated_at = NOW()`,
      [uuidv4(), stationId, values.openingGrossTotal],
    )

    if (values.globalCounter != null) {
      await txQuery(
        client,
        `INSERT INTO tanzania_fiscal_counters (
           station_id, counter_key, counter_value
         ) VALUES ($1::uuid, 'receipt:global', $2)
         ON CONFLICT (station_id, counter_key)
         DO UPDATE SET counter_value = EXCLUDED.counter_value,
                       updated_at = NOW()`,
        [stationId, values.globalCounter],
      )
    }

    if (values.dailyCounter != null) {
      await txQuery(
        client,
        `INSERT INTO tanzania_fiscal_counters (
           station_id, counter_key, counter_value
         ) VALUES ($1::uuid, $2, $3)
         ON CONFLICT (station_id, counter_key)
         DO UPDATE SET counter_value = EXCLUDED.counter_value,
                       updated_at = NOW()`,
        [stationId, dailyCounterKey, values.dailyCounter],
      )
    }

    if (values.deviceIdOverride !== undefined) {
      await txQuery(
        client,
        `UPDATE station_settings
            SET tanzania_device_id_override = $2,
                updated_at = NOW()
          WHERE station_id = $1::uuid`,
        [stationId, values.deviceIdOverride],
      )
    }

    if (shouldUpdateReceiptPrefix) {
      await txQuery(
        client,
        `UPDATE station_settings
            SET tanzania_receipt_verification_prefix_mode = $2,
                tanzania_receipt_verification_prefix_override = $3,
                updated_at = NOW()
          WHERE station_id = $1::uuid`,
        [
          stationId,
          receiptVerificationPrefixMode,
          receiptVerificationPrefixOverride,
        ],
      )
    }
  })

  return await getTanzaniaGrossTotalSummary(stationId)
}
