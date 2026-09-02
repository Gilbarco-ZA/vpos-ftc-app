import { queryAll, queryOne, queryPaginated } from '@/src/platform/db/postgres'
import { getBrandingSettings } from '@/src/shared/branding/settings'
import { mapFiscalReceipt } from '@/src/shared/receipts/mapFiscalReceipt'
import { normalizeReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { extractTanzaniaProxyReceiptMetadata } from '@/src/modules/tanzania-fiscal/domain/proxyReceiptMetadata'
import { buildTanzaniaReceiptVerificationUrl } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'
import { isFuelLikeProduct } from '@/src/modules/transactions/domain/product-classification'
import { generateReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptGenerator'

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
    `SELECT t.id,
            t.transaction_date_time,
            t.pos_reference,
            t.pump_number,
            t.fuel_type,
            t.volume,
            t.total_amount,
            t.status,
            t.retry_count,
            t.fiscal_queue_enqueued_at,
            t.last_error,
            t.customer_id,
            t.doms_source_system,
            c.buyer_name AS customer_buyer_name,
            c.tin AS customer_tin
       FROM transactions t
       LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.station_id = $1
        AND (t.status IS NULL OR t.status <> 'FISCALIZED')
        AND t.deleted_at IS NULL
      ORDER BY t.transaction_date_time DESC
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
  const rows = await queryAll<Omit<EditableTransactionLine, 'isFuel'>>(
    getTransactionEditableLinesSql,
    [stationId, transactionId],
  )

  return rows.map((row) => ({
    ...row,
    isFuel: isFuelLikeProduct(row),
  }))
}

export async function getLatestTransactionReceiptRepo(
  stationId: string,
  transactionId: string,
) {
  return await queryOne<any>(
    `SELECT * FROM receipts
     WHERE station_id = $1
       AND transaction_id = NULLIF(BTRIM(CAST($2 AS text)), '')::uuid
     ORDER BY generated_at DESC
     LIMIT 1`,
    [stationId, transactionId],
  )
}

export async function createTransactionReceiptRepo(
  stationId: string,
  transactionId: string,
) {
  const receiptPayload = await generateReceipt({ stationId, transactionId })
  return await queryOne<any>(
    `
      INSERT INTO receipts (
        id, transaction_id, station_id, receipt_number,
        html_content, plain_text_content, fiscal_data, branding_snapshot,
        render_version
      )
      VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)
      RETURNING *
    `,
    [
      uuidv4(),
      transactionId,
      stationId,
      receiptPayload.receiptNumber,
      receiptPayload.plainTextContent,
      JSON.stringify(receiptPayload.fiscalData),
      receiptPayload.brandingSnapshot
        ? JSON.stringify(receiptPayload.brandingSnapshot)
        : null,
      receiptPayload.renderVersion,
    ],
  )
}

export async function getOrCreateLatestTransactionReceiptRepo(
  stationId: string,
  transactionId: string,
) {
  const existing = await getLatestTransactionReceiptRepo(
    stationId,
    transactionId,
  )
  if (existing) {
    const fiscalState = await queryOne<Record<string, any>>(
      `SELECT t.fiscalized_at,
              fs.country,
              c.tin AS customer_tin,
              ss.tanzania_receipt_verification_prefix_mode,
              event.request_payload,
              event.response_payload
         FROM transactions t
         JOIN fuel_stations fs ON fs.id = t.station_id
         LEFT JOIN customers c
           ON c.id = t.customer_id
          AND c.station_id = t.station_id
         LEFT JOIN station_settings ss ON ss.station_id = t.station_id
         LEFT JOIN LATERAL (
           SELECT fe.request_payload, fe.response_payload
             FROM fiscalization_events fe
            WHERE fe.station_id = t.station_id
              AND fe.transaction_id = t.id
              AND fe.status = 'SUCCESS'
            ORDER BY fe.occurred_at DESC, fe.created_at DESC
            LIMIT 1
         ) event ON TRUE
        WHERE t.station_id = $1
          AND t.id = $2::uuid
        LIMIT 1`,
      [stationId, transactionId],
    )
    const generatedAt = new Date(existing.generated_at ?? 0).getTime()
    const fiscalizedAt = new Date(fiscalState?.fiscalized_at ?? 0).getTime()
    const predatesFiscalization =
      Number.isFinite(generatedAt) &&
      Number.isFinite(fiscalizedAt) &&
      fiscalizedAt > 0 &&
      generatedAt < fiscalizedAt
    const isTanzania = ['TZ', 'TZA', 'TANZANIA'].includes(
      String(fiscalState?.country ?? '')
        .trim()
        .toUpperCase(),
    )
    const metadata = isTanzania
      ? extractTanzaniaProxyReceiptMetadata(fiscalState?.request_payload)
      : null
    const proxyReceipt = isTanzania
      ? mapFiscalReceipt(fiscalState?.response_payload)
      : null
    const storedFiscalData =
      typeof existing.fiscal_data === 'string'
        ? (() => {
            try {
              return JSON.parse(existing.fiscal_data)
            } catch {
              return null
            }
          })()
        : existing.fiscal_data
    const storedVerificationCode = String(
      storedFiscalData?.receipt?.fiscalVerificationCode ?? '',
    ).trim()
    const storedQrData = String(
      storedFiscalData?.receipt?.fiscalQrCodeData ?? '',
    ).trim()
    const expectedVerificationCode = firstNonEmpty(
      proxyReceipt?.fiscalVerificationCode,
      metadata?.receiptVerificationNumber,
    )
    const expectedProxyQrData = firstNonEmpty(
      proxyReceipt?.fiscalQrCodeData,
      metadata?.receiptVerificationNumber
        ? buildTanzaniaReceiptVerificationUrl({
            receiptVerificationNumber: metadata.receiptVerificationNumber,
            mode: fiscalState?.tanzania_receipt_verification_prefix_mode,
            invoiceDate: metadata.invoiceDate,
            receiptTime: proxyReceipt?.receiptTime,
          })
        : null,
    )
    const hasStaleVerificationCode = Boolean(
      expectedVerificationCode &&
      storedVerificationCode !== expectedVerificationCode,
    )
    const hasStaleQrData = Boolean(
      expectedProxyQrData && storedQrData !== expectedProxyQrData,
    )
    const hasStaleTanzaniaCustomerIdType = Boolean(
      isTanzania &&
      firstNonEmpty(fiscalState?.customer_tin) &&
      /CUSTOMER ID TYPE:\s*6\b/i.test(
        String(existing.plain_text_content ?? ''),
      ),
    )
    const hasStaleTanzaniaPrintLayout = Boolean(
      isTanzania &&
      !String(existing.plain_text_content ?? '').includes(
        '[IMAGE:TRA_RECEIPT_START]',
      ),
    )

    if (
      !predatesFiscalization &&
      !hasStaleVerificationCode &&
      !hasStaleQrData &&
      !hasStaleTanzaniaCustomerIdType &&
      !hasStaleTanzaniaPrintLayout
    )
      return existing
  }
  return await createTransactionReceiptRepo(stationId, transactionId)
}

export async function getCreditNoteDetailsRepo(
  stationId: string,
  transactionId: string,
) {
  const creditNote = await queryOne<any>(
    `SELECT cn.*, t.station_id, t.pos_reference, t.total_amount, t.volume,
            t.fuel_type, t.pump_number, t.transaction_date_time,
            t.fiscalization_reference, t.fiscalization_response,
            t.customer_id, NULL::text AS currency,
            c.buyer_name, c.tin, c.pin
     FROM credit_notes cn
     JOIN transactions t ON t.id = cn.transaction_id AND t.station_id = cn.station_id
     LEFT JOIN customers c ON c.id = t.customer_id
     WHERE cn.station_id = $1
       AND cn.transaction_id = NULLIF(BTRIM(CAST($2 AS text)), '')::uuid
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
    fallbackProduct,
    transactionLines,
    stationSettings,
    branding,
  ] = await Promise.all([
    queryOne<any>(`SELECT * FROM fuel_stations WHERE id = $1`, [stationId]),
    kvGet<any>(stationId, 'tax_pin'),
    kvGet<any>(stationId, KV_KEYS.SITE_PROFILE),
    queryOne<any>(
      `SELECT COALESCE(ext_product_code, product_code) AS product_code,
              sku,
              COALESCE(ext_tax_code, tax_code) AS tax_code,
              tax_rate
         FROM products
        WHERE station_id = $1
          AND (
            product_id = NULLIF(BTRIM(CAST($2 AS text)), '')
            OR product_code = NULLIF(BTRIM(CAST($2 AS text)), '')
            OR ext_product_code = NULLIF(BTRIM(CAST($2 AS text)), '')
            OR LOWER(COALESCE(product_name, '')) = LOWER(NULLIF(BTRIM(CAST($3 AS text)), ''))
            OR LOWER(COALESCE(product_name, '')) = LOWER(NULLIF(BTRIM(CAST($4 AS text)), ''))
          )
        ORDER BY CASE WHEN product_id = NULLIF(BTRIM(CAST($2 AS text)), '') THEN 0 ELSE 1 END,
                 CASE WHEN product_code = NULLIF(BTRIM(CAST($2 AS text)), '') THEN 0 ELSE 1 END,
                 CASE WHEN ext_product_code = NULLIF(BTRIM(CAST($2 AS text)), '') THEN 0 ELSE 1 END,
                 product_name ASC
        LIMIT 1`,
      [
        stationId,
        creditNote.grade_id,
        creditNote.grade_name,
        creditNote.fuel_type,
      ],
    ),
    queryAll<any>(
      `SELECT
             tl.quantity,
             COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price) AS unit_price,
             (tl.quantity * COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price)) AS line_total,
              COALESCE(p.ext_currency, p.currency) AS currency,
             p.product_name,
             COALESCE(p.ext_product_code, p.product_code, t.grade_id) AS product_code,
             p.sku,
             COALESCE(tl.tax_code, p.tax_code) AS tax_code,
             p.ext_tax_code,
             COALESCE(tl.tax_rate, p.tax_rate) AS tax_rate
           FROM transaction_lines tl
           JOIN transactions t
             ON t.id = tl.transaction_id
            AND t.station_id = $1
           LEFT JOIN products p
             ON p.station_id = $1
            AND (
              p.id = tl.product_id
              OR p.product_id = tl.product_id::text
              OR p.product_code = tl.product_id::text
              OR p.ext_product_code = tl.product_id::text
              OR p.product_id = NULLIF(BTRIM(CAST(t.grade_id AS text)), '')
              OR p.product_code = NULLIF(BTRIM(CAST(t.grade_id AS text)), '')
              OR p.ext_product_code = NULLIF(BTRIM(CAST(t.grade_id AS text)), '')
            )
           WHERE tl.transaction_id = NULLIF(BTRIM(CAST($2 AS text)), '')::uuid
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
    transaction: {
      ...creditNote,
      product_code: fallbackProduct?.product_code ?? creditNote.product_code,
      sku: fallbackProduct?.sku ?? creditNote.sku,
      tax_code: fallbackProduct?.tax_code ?? creditNote.tax_code,
      tax_rate: fallbackProduct?.tax_rate ?? creditNote.tax_rate,
    },
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
