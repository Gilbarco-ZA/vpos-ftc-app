import { queryAll, queryOne, queryPaginated } from '@/src/platform/db/postgres'
import { getBrandingSettings } from '@/src/shared/branding/settings'
import { normalizeReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'

import type {
  EditableTransactionLine,
  ListTransactionsRepoOptions,
  TransactionCatalogProduct,
} from './transaction.types'
import {
  buildTransactionsFilter,
  getTransactionDetailsSql,
  getTransactionEditableLinesSql,
  getTransactionLinesSql,
  getTransactionQueueSql,
  listPendingTransactionsSql,
  listTransactionCatalogProductsSql,
  listTransactionsCountSql,
  listTransactionsSelectSql,
} from './transaction.sql'

const firstNonEmpty = (...values: Array<any>) => {
  for (const value of values) {
    const str = String(value ?? '').trim()
    if (str.length) return str
  }
  return undefined
}

const decimalValue = (value: any) =>
  typeof value === 'number' ? value : undefined

export async function listTransactionsRepo(
  stationId: string,
  opts: ListTransactionsRepoOptions = {},
) {
  const { params, where, orderBy } = buildTransactionsFilter(stationId, opts)
  const baseQuery = `${listTransactionsSelectSql}
${where}
${orderBy}`
  const countQuery = `${listTransactionsCountSql}
${where}`

  if (opts.page || opts.pageSize) {
    const page = Math.max(1, Number(opts.page || 1))
    const pageSize = Math.min(
      200,
      Math.max(1, Number(opts.pageSize || opts.limit || 50)),
    )
    const paginated = await queryPaginated<any>(baseQuery, countQuery, params, {
      page,
      pageSize,
    })
    return {
      items: paginated.data,
      total: paginated.total,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalPages: paginated.totalPages,
    }
  }

  const limit = Math.min(500, Math.max(1, Number(opts.limit || 200)))
  const rows = await queryAll<any>(`${baseQuery} LIMIT $${params.length + 1}`, [
    ...params,
    limit,
  ])
  return {
    items: rows,
    total: rows.length,
    page: 1,
    pageSize: limit,
    totalPages: 1,
  }
}

export async function getTransactionDetailsRepo(
  stationId: string,
  transactionId: string,
) {
  const transaction = await queryOne<any>(getTransactionDetailsSql, [
    stationId,
    transactionId,
  ])
  if (!transaction) return null
  const [lines, transactionQueue] = await Promise.all([
    queryAll<any>(getTransactionLinesSql, [stationId, transactionId]),
    queryOne<any>(getTransactionQueueSql, [stationId, transactionId]),
  ])
  return { ...transaction, lines, transactionQueue }
}

export async function listPendingTransactionsRepo(stationId: string) {
  return await queryAll<any>(listPendingTransactionsSql, [stationId])
}

export async function listNonFiscalizedTransactionsRepo(stationId: string) {
  return await queryAll<any>(
    `SELECT id,
            transaction_date_time,
            pos_reference,
            pump_number,
            fuel_type,
            volume,
            total_amount,
            status,
            retry_count,
            fiscal_queue_enqueued_at,
            last_error
       FROM transactions
      WHERE station_id = $1
        AND (status IS NULL OR status <> 'FISCALIZED')
        AND deleted_at IS NULL
      ORDER BY transaction_date_time DESC
      LIMIT 200`,
    [stationId],
  )
}

export async function listFiscalizedTransactionsRepo(stationId: string) {
  return await queryAll<any>(
    `SELECT t.id,
            t.fiscalized_at,
            t.transaction_date_time,
            t.pos_reference,
            t.cloud_transaction_id,
            t.pump_number,
            t.fuel_type,
            t.volume,
            t.total_amount,
            t.status,
            t.fiscalization_reference,
            c.buyer_name,
            c.tin
       FROM transactions t
       LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.station_id = $1
        AND t.fiscalized_at IS NOT NULL
        AND t.deleted_at IS NULL
      ORDER BY t.fiscalized_at DESC NULLS LAST, t.transaction_date_time DESC
      LIMIT 200`,
    [stationId],
  )
}

export async function listTransactionCatalogProductsRepo(stationId: string) {
  return await queryAll<TransactionCatalogProduct>(
    listTransactionCatalogProductsSql,
    [stationId],
  )
}

export async function getTransactionEditableLinesRepo(
  stationId: string,
  transactionId: string,
) {
  return await queryAll<EditableTransactionLine>(
    getTransactionEditableLinesSql,
    [stationId, transactionId],
  )
}

export async function getLatestTransactionReceiptRepo(
  stationId: string,
  transactionId: string,
) {
  return await queryOne<any>(
    `SELECT * FROM receipts
     WHERE station_id = $1 AND transaction_id = $2::uuid
     ORDER BY generated_at DESC
     LIMIT 1`,
    [stationId, transactionId],
  )
}

export async function getCreditNoteDetailsRepo(
  stationId: string,
  transactionId: string,
) {
  const creditNote = await queryOne<any>(
    `SELECT cn.*, t.station_id, t.pos_reference, t.total_amount, t.volume,
            t.fuel_type, t.pump_number, t.transaction_date_time,
            t.fiscalization_reference, t.fiscalization_response,
            t.customer_id, t.currency,
            c.buyer_name, c.tin, c.pin
     FROM credit_notes cn
     JOIN transactions t ON t.id = cn.transaction_id AND t.station_id = cn.station_id
     LEFT JOIN customers c ON c.id = t.customer_id
     WHERE cn.station_id = $1
       AND cn.transaction_id = $2::uuid
     ORDER BY cn.created_at DESC
     LIMIT 1`,
    [stationId, transactionId],
  )

  if (!creditNote) return null

  const rawResponse = creditNote.proxy_response

  const [
    station,
    taxPinKv,
    siteProfile,
    transactionLines,
    stationSettings,
    branding,
  ] = await Promise.all([
    queryOne<any>(`SELECT * FROM fuel_stations WHERE id = $1`, [stationId]),
    kvGet<any>(stationId, 'tax_pin'),
    kvGet<any>(stationId, KV_KEYS.SITE_PROFILE),
    queryAll<any>(
      `SELECT
             tl.quantity,
             COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price) AS unit_price,
             (tl.quantity * COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price)) AS line_total,
             p.product_name,
             p.tax_code,
             p.ext_tax_code
           FROM transaction_lines tl
           LEFT JOIN products p
             ON p.id = tl.product_id
             AND p.station_id = $1
           WHERE tl.transaction_id = $2::uuid
           ORDER BY tl.created_at ASC`,
      [stationId, transactionId],
    ),
    queryOne<any>(
      `SELECT volume_decimals, money_decimals, unit_price_decimals
           FROM station_settings
          WHERE station_id = $1`,
      [stationId],
    ),
    getBrandingSettings(stationId),
  ])

  const stationTaxNumber = firstNonEmpty(
    station?.tin,
    station?.tax_pin,
    station?.taxPin,
    siteProfile?.taxNumber,
    taxPinKv?.tin,
    taxPinKv?.tax_pin,
    taxPinKv?.pin,
  )
  const stationPin = firstNonEmpty(
    station?.pin,
    taxPinKv?.pin,
    taxPinKv?.tax_pin,
  )

  const receipt = normalizeReceipt({
    transaction: creditNote,
    stationName: station?.name,
    station,
    stationTaxNumber,
    stationPin,
    transactionLines,
    raw: rawResponse,
    titleOverride: 'CREDIT NOTE',
    decimalOverrides: {
      volume: decimalValue(stationSettings?.volume_decimals),
      money: decimalValue(stationSettings?.money_decimals),
      unitPrice: decimalValue(stationSettings?.unit_price_decimals),
    },
    branding: branding
      ? {
          logoPath: (branding as any)?.logo_path ?? null,
          primaryColor: (branding as any)?.primary_color ?? null,
          secondaryColor: (branding as any)?.secondary_color ?? null,
          stationDisplayName: (branding as any)?.station_display_name ?? null,
          receiptHeaderText: (branding as any)?.receipt_header_text ?? null,
          receiptFooterText: (branding as any)?.receipt_footer_text ?? null,
        }
      : undefined,
  })

  return {
    receipt,
    creditNote: {
      id: creditNote.id,
      status: creditNote.status,
      reasonCode: creditNote.reason_code,
      notes: creditNote.notes,
      lastError: creditNote.last_error,
      createdAt: creditNote.created_at,
    },
    raw: rawResponse ?? null,
  }
}
