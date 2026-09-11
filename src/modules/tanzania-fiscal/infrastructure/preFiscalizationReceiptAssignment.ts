import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'

import { getRegisteredTanzaniaReceiptCode } from '@/src/modules/tanzania-fiscal/application/registeredReceiptCode'
import { resolveTanzaniaReceiptVerificationPrefix } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'
import { dateParts } from '@/src/modules/tanzania-fiscal/infrastructure/xml'
import { resolveTanzaniaFiscalTimezone } from '@/src/modules/tanzania-fiscal/infrastructure/timezone'

export type TanzaniaPreFiscalizationReceiptAssignment = {
  invoice_number: string
  receipt_verification_number: string
  z_number: string
  daily_counter: number
  global_counter: number
  invoice_date: string | Date
  timezone: string
}

const normalizeExisting = (row: any, timezone: string) => ({
  ...row,
  daily_counter: Number(row.daily_counter),
  global_counter: Number(row.global_counter),
  timezone,
})

export async function ensureTanzaniaPreFiscalizationReceiptAssignment(input: {
  stationId: string
  transactionId: string
}): Promise<TanzaniaPreFiscalizationReceiptAssignment | null> {
  const preliminary = await queryOne<any>(
    `SELECT fs.country,
            ss.tanzania_receipt_verification_prefix_mode AS receipt_verification_prefix_mode,
            ss.tanzania_receipt_verification_prefix_override AS receipt_verification_prefix_override,
            a.invoice_number,
            a.receipt_verification_number,
            a.z_number,
            a.daily_counter,
            a.global_counter,
            a.invoice_date
       FROM transactions t
       JOIN fuel_stations fs ON fs.id = t.station_id
       JOIN station_settings ss ON ss.station_id = t.station_id
  LEFT JOIN tanzania_proxy_invoice_assignments a
         ON a.station_id = t.station_id
        AND a.transaction_id = t.id
      WHERE t.station_id = $1::uuid
        AND t.id = $2::uuid
        AND t.deleted_at IS NULL
      LIMIT 1`,
    [input.stationId, input.transactionId],
  )
  if (!preliminary) return null

  const country = String(preliminary.country ?? '')
    .trim()
    .toUpperCase()
  if (
    !['TZ', 'TZA', 'TANZANIA', 'UNITED REPUBLIC OF TANZANIA'].includes(country)
  ) {
    return null
  }

  const timezone = await resolveTanzaniaFiscalTimezone(input.stationId)
  if (preliminary.receipt_verification_number) {
    return normalizeExisting(preliminary, timezone)
  }

  const prefixMode =
    preliminary.receipt_verification_prefix_mode === 'manual'
      ? 'manual'
      : 'registered'
  const registeredReceiptCode =
    prefixMode === 'registered'
      ? await getRegisteredTanzaniaReceiptCode(input.stationId)
      : null
  const receiptVerificationPrefix = resolveTanzaniaReceiptVerificationPrefix({
    mode: prefixMode,
    registeredReceiptCode,
    override: preliminary.receipt_verification_prefix_override,
  })

  return await withTransaction(async (client) => {
    await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `tanzania-proxy-invoice:${input.stationId}:${input.transactionId}`,
    ])

    const context = await txQuery<{
      country: string | null
      transaction_date_time: string | Date
    }>(
      client,
      `SELECT fs.country,
              t.transaction_date_time
         FROM transactions t
         JOIN fuel_stations fs ON fs.id = t.station_id
        WHERE t.station_id = $1::uuid
          AND t.id = $2::uuid
          AND t.deleted_at IS NULL
        LIMIT 1
        FOR SHARE OF t, fs`,
      [input.stationId, input.transactionId],
    )
    const row = context.rows[0]
    if (!row) return null

    const existing = await txQuery<any>(
      client,
      `SELECT invoice_number,
              receipt_verification_number,
              z_number,
              daily_counter,
              global_counter,
              invoice_date
         FROM tanzania_proxy_invoice_assignments
        WHERE station_id = $1::uuid
          AND transaction_id = $2::uuid
        LIMIT 1`,
      [input.stationId, input.transactionId],
    )
    if (existing.rows[0]) {
      return normalizeExisting(existing.rows[0], timezone)
    }

    const invoiceDate = new Date(row.transaction_date_time).toISOString()
    const transactionDate = dateParts(invoiceDate, timezone)
    const fiscalDate = transactionDate

    const global = await txQuery<{ counter_value: string | number }>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1::uuid, 'receipt:global', 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [input.stationId],
    )
    const daily = await txQuery<{ counter_value: string | number }>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1::uuid, $2, 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [input.stationId, `receipt:${transactionDate.compactDate}`],
    )

    const globalCounter = Number(global.rows[0]?.counter_value ?? 1)
    const dailyCounter = Number(daily.rows[0]?.counter_value ?? 1)
    const invoiceNumber = `INV-${transactionDate.isoDate.replace(/-/g, '/')}-${String(
      dailyCounter,
    ).padStart(2, '0')}`
    const receiptVerificationNumber = `${receiptVerificationPrefix}${globalCounter}`

    const inserted = await txQuery<any>(
      client,
      `INSERT INTO tanzania_proxy_invoice_assignments (
         station_id, transaction_id, invoice_number,
         receipt_verification_number, z_number,
         daily_counter, global_counter, invoice_date
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::timestamptz)
       RETURNING invoice_number,
                 receipt_verification_number,
                 z_number,
                 daily_counter,
                 global_counter,
                 invoice_date`,
      [
        input.stationId,
        input.transactionId,
        invoiceNumber,
        receiptVerificationNumber,
        fiscalDate.compactDate,
        dailyCounter,
        globalCounter,
        invoiceDate,
      ],
    )

    return normalizeExisting(inserted.rows[0], timezone)
  })
}
