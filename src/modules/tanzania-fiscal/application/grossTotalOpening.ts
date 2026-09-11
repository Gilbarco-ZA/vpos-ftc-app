import {
  query,
  queryOne,
  txQuery,
  withTransaction,
} from '@/src/platform/db/postgres'
import { localDateTime } from '@/src/shared/time/localDateTime'
import { uuidv4 } from '@/src/shared/utils/uuid'

import type {
  TanzaniaReceiptVerificationPrefixMode,
  TanzaniaReceiptVerificationUrlMode,
} from '../domain/receiptVerificationPrefix'
import { calculateTanzaniaGrossTotal } from '../domain/grossTotal'
import {
  DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE,
  DEFAULT_TANZANIA_RECEIPT_VERIFICATION_URL_MODE,
  normalizeTanzaniaReceiptVerificationPrefixOverride,
  normalizeTanzaniaReceiptVerificationUrlOverride,
  resolveTanzaniaReceiptVerificationPrefix,
  resolveTanzaniaReceiptVerificationUrlBase,
} from '../domain/receiptVerificationPrefix'
import { getRegisteredTanzaniaReceiptCode } from './registeredReceiptCode'
import { resolveTanzaniaFiscalTimezone } from '../infrastructure/timezone'

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
  receipt_verification_url_mode: TanzaniaReceiptVerificationUrlMode | null
  receipt_verification_url_override: string | null
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
  registeredReceiptCode: string | null
  receiptVerificationPrefixMode: TanzaniaReceiptVerificationPrefixMode
  receiptVerificationPrefixOverride: string | null
  effectiveReceiptVerificationPrefix: string | null
  receiptVerificationUrlMode: TanzaniaReceiptVerificationUrlMode
  receiptVerificationUrlOverride: string | null
  effectiveReceiptVerificationUrlBase: string
}

export type TanzaniaFiscalOpeningValues = {
  openingGrossTotal: number
  dailyCounter?: number
  globalCounter?: number
  deviceIdOverride?: string | null
  receiptVerificationPrefixMode?: TanzaniaReceiptVerificationPrefixMode
  receiptVerificationPrefixOverride?: string | null
  receiptVerificationUrlMode?: TanzaniaReceiptVerificationUrlMode
  receiptVerificationUrlOverride?: string | null
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
  const timezone = await resolveTanzaniaFiscalTimezone(stationId)
  const stationNow = localDateTime(new Date(), timezone)
  const dailyCounterKey = `receipt:${stationNow.compactDate}`

  const [row, registeredReceiptCode] = await Promise.all([
    queryOne<GrossTotalRow>(
      `SELECT COALESCE((SELECT ss.tanzania_gross_total_opening FROM station_settings ss WHERE ss.station_id = $1::uuid), 0) AS opening_gross_total,
              (SELECT ss.tanzania_gross_total_opening_captured_at FROM station_settings ss WHERE ss.station_id = $1::uuid) AS opening_gross_total_captured_at,
              COALESCE(SUM(t.total_amount), 0) AS local_fiscal_turnover,
              COALESCE((SELECT tc.counter_value FROM tanzania_fiscal_counters tc WHERE tc.station_id = $1::uuid AND tc.counter_key = 'receipt:global'), 0) AS global_counter,
              COALESCE((SELECT tc.counter_value FROM tanzania_fiscal_counters tc WHERE tc.station_id = $1::uuid AND tc.counter_key = $2), 0) AS daily_counter,
              $3::text AS daily_counter_date,
              (SELECT NULLIF(BTRIM(ss.tanzania_device_id_override), '') FROM station_settings ss WHERE ss.station_id = $1::uuid) AS device_id_override,
              (SELECT ss.tanzania_receipt_verification_prefix_mode FROM station_settings ss WHERE ss.station_id = $1::uuid) AS receipt_verification_prefix_mode,
              (SELECT ss.tanzania_receipt_verification_prefix_override FROM station_settings ss WHERE ss.station_id = $1::uuid) AS receipt_verification_prefix_override,
              (SELECT ss.tanzania_receipt_verification_url_mode FROM station_settings ss WHERE ss.station_id = $1::uuid) AS receipt_verification_url_mode,
              (SELECT ss.tanzania_receipt_verification_url_override FROM station_settings ss WHERE ss.station_id = $1::uuid) AS receipt_verification_url_override
         FROM transactions t
        WHERE t.station_id = $1::uuid
          AND t.deleted_at IS NULL
          AND t.status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')`,
      [stationId, dailyCounterKey, stationNow.isoDate],
    ),
    getRegisteredTanzaniaReceiptCode(stationId),
  ])

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
  const receiptVerificationUrlMode =
    row?.receipt_verification_url_mode ??
    DEFAULT_TANZANIA_RECEIPT_VERIFICATION_URL_MODE
  const receiptVerificationUrlOverride =
    row?.receipt_verification_url_override ?? null

  let effectiveReceiptVerificationPrefix: string | null = null
  try {
    effectiveReceiptVerificationPrefix =
      resolveTanzaniaReceiptVerificationPrefix({
        mode: receiptVerificationPrefixMode,
        registeredReceiptCode,
        override: receiptVerificationPrefixOverride,
      })
  } catch {}

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
    registeredReceiptCode,
    receiptVerificationPrefixMode,
    receiptVerificationPrefixOverride,
    effectiveReceiptVerificationPrefix,
    receiptVerificationUrlMode,
    receiptVerificationUrlOverride,
    effectiveReceiptVerificationUrlBase:
      resolveTanzaniaReceiptVerificationUrlBase({
        mode: receiptVerificationUrlMode,
        override: receiptVerificationUrlOverride,
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
  const shouldUpdateReceiptUrl =
    values.receiptVerificationUrlMode !== undefined ||
    values.receiptVerificationUrlOverride !== undefined

  if (
    values.receiptVerificationPrefixOverride !== undefined &&
    values.receiptVerificationPrefixMode === undefined
  ) {
    throw new Error(
      'Receipt verification prefix mode is required when updating the override.',
    )
  }
  if (
    values.receiptVerificationUrlOverride !== undefined &&
    values.receiptVerificationUrlMode === undefined
  ) {
    throw new Error(
      'Receipt verification URL mode is required when updating the manual URL.',
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
  if (shouldUpdateReceiptPrefix && receiptVerificationPrefixMode === 'manual') {
    resolveTanzaniaReceiptVerificationPrefix({
      mode: 'manual',
      override: receiptVerificationPrefixOverride,
    })
  }

  const receiptVerificationUrlMode =
    values.receiptVerificationUrlMode ??
    DEFAULT_TANZANIA_RECEIPT_VERIFICATION_URL_MODE
  const receiptVerificationUrlOverride =
    values.receiptVerificationUrlOverride === undefined
      ? null
      : normalizeTanzaniaReceiptVerificationUrlOverride(
          values.receiptVerificationUrlOverride,
        )
  if (shouldUpdateReceiptUrl) {
    resolveTanzaniaReceiptVerificationUrlBase({
      mode: receiptVerificationUrlMode,
      override: receiptVerificationUrlOverride,
    })
  }

  const timezone = await resolveTanzaniaFiscalTimezone(stationId)
  const dailyCounterKey = `receipt:${localDateTime(new Date(), timezone).compactDate}`

  await withTransaction(async (client) => {
    const station = await txQuery<{ exists: boolean }>(
      client,
      `SELECT EXISTS(
         SELECT 1 FROM fuel_stations WHERE id = $1::uuid AND deleted_at IS NULL
       ) AS exists`,
      [stationId],
    )
    if (!station.rows?.[0]?.exists) throw new Error(`Station ${stationId} not found`)

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
        `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
         VALUES ($1::uuid, 'receipt:global', $2)
         ON CONFLICT (station_id, counter_key)
         DO UPDATE SET counter_value = EXCLUDED.counter_value, updated_at = NOW()`,
        [stationId, values.globalCounter],
      )
    }
    if (values.dailyCounter != null) {
      await txQuery(
        client,
        `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (station_id, counter_key)
         DO UPDATE SET counter_value = EXCLUDED.counter_value, updated_at = NOW()`,
        [stationId, dailyCounterKey, values.dailyCounter],
      )
    }
    if (values.deviceIdOverride !== undefined) {
      await txQuery(
        client,
        `UPDATE station_settings
            SET tanzania_device_id_override = $2, updated_at = NOW()
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
    if (shouldUpdateReceiptUrl) {
      await txQuery(
        client,
        `UPDATE station_settings
            SET tanzania_receipt_verification_url_mode = $2,
                tanzania_receipt_verification_url_override = $3,
                updated_at = NOW()
          WHERE station_id = $1::uuid`,
        [stationId, receiptVerificationUrlMode, receiptVerificationUrlOverride],
      )
    }
  })

  return await getTanzaniaGrossTotalSummary(stationId)
}
