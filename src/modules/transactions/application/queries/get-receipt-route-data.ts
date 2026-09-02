import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { getBrandingSettings } from '@/src/shared/branding/settings'
import { mapFiscalReceipt } from '@/src/shared/receipts/mapFiscalReceipt'
import { normalizeReceipt } from '@/src/shared/receipts/normalizeReceipt'
import {
  resolveReceiptContent,
  resolveReceiptRowContent,
} from '@/src/shared/receipts/receiptContent'
import { normalizeReceiptBrandingSnapshot } from '@/src/shared/receipts/receiptSnapshots'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'

import { resolveTanzaniaCustomerIdentity } from '@/src/modules/tanzania-fiscal/domain/customerIdentity'
import { getTanzaniaDomsUnitPrice } from '@/src/modules/tanzania-fiscal/domain/domsUnitPrice'
import { extractTanzaniaProxyReceiptMetadata } from '@/src/modules/tanzania-fiscal/domain/proxyReceiptMetadata'
import { buildTanzaniaReceiptVerificationUrl } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'

import { resolveCanonicalFiscalizationPayload } from './resolve-canonical-fiscalization-payload'

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text.length) return text
  }
  return undefined
}

const decimalValue = (value: unknown) =>
  typeof value === 'number' ? value : undefined

export type ReceiptRoutePayload = {
  ok: true
  receipt: NormalizedReceipt
  raw?: unknown
  voided?: boolean
  voidedAt?: string | null
  presentation?: {
    receiptId: string
    receiptNumber: string
    plainTextContent: string | null
    htmlContent: string | null
    renderVersion: number
    generatedAt: string | null
  }
}

export async function getReceiptRoutePayload(input: {
  stationId: string
  transactionId: string
  previewMode: boolean
  attendantName?: string
}): Promise<
  | { found: true; payload: ReceiptRoutePayload }
  | { found: false; error: string; raw?: unknown }
> {
  const transaction = await queryOne<Record<string, any>>(
    `
      SELECT t.*, c.buyer_name, c.tin, c.pin
      FROM transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.station_id = $1
        AND t.deleted_at IS NULL
        AND t.id::text = $2
      LIMIT 1
    `,
    [input.stationId, input.transactionId],
  )
  if (!transaction) return { found: false, error: 'Transaction not found' }

  const [
    station,
    taxPinKv,
    siteProfile,
    fallbackProduct,
    transactionLines,
    branding,
    storedReceipt,
    latestFiscalEvent,
    stationSettings,
  ] = await Promise.all([
    queryOne<Record<string, any>>('SELECT * FROM fuel_stations WHERE id = $1', [
      input.stationId,
    ]),
    kvGet<Record<string, any>>(input.stationId, 'tax_pin'),
    kvGet<Record<string, any>>(input.stationId, KV_KEYS.SITE_PROFILE),
    queryOne<Record<string, any>>(
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
        input.stationId,
        transaction.grade_id,
        transaction.grade_name,
        transaction.fuel_type,
      ],
    ),
    queryAll<Record<string, any>>(
      `
        SELECT
          tl.quantity,
          COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price) AS unit_price,
          (tl.quantity * COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price)) AS line_total,
          p.product_name,
          COALESCE(p.ext_product_code, p.product_code, t.grade_id) AS product_code,
          p.sku,
          COALESCE(tl.tax_code, p.tax_code) AS tax_code,
          p.ext_tax_code,
          COALESCE(tl.tax_rate, p.tax_rate) AS tax_rate
        FROM transaction_lines tl
        JOIN transactions t ON t.id = tl.transaction_id AND t.station_id = $1
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
        WHERE tl.transaction_id = $2::uuid
        ORDER BY tl.created_at ASC
      `,
      [input.stationId, transaction.id],
    ),
    getBrandingSettings(input.stationId),
    queryOne<Record<string, any>>(
      `SELECT id, receipt_number, fiscal_data, branding_snapshot,
              plain_text_content, html_content, render_version, generated_at
         FROM receipts
        WHERE station_id = $1 AND transaction_id = $2::uuid
        ORDER BY generated_at DESC
        LIMIT 1`,
      [input.stationId, transaction.id],
    ).catch(() => null),
    queryOne<Record<string, any>>(
      `SELECT id, engine, transport, request_payload, response_payload, occurred_at
         FROM fiscalization_events
        WHERE station_id = $1
          AND transaction_id = $2::uuid
          AND status = 'SUCCESS'
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT 1`,
      [input.stationId, transaction.id],
    ).catch(() => null),
    queryOne<Record<string, any>>(
      `SELECT volume_decimals,
              money_decimals,
              unit_price_decimals,
              tanzania_receipt_verification_prefix_mode
         FROM station_settings
        WHERE station_id = $1`,
      [input.stationId],
    ),
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
  const isTanzania = ['TZ', 'TZA', 'TANZANIA'].includes(
    String(station?.country ?? '')
      .trim()
      .toUpperCase(),
  )
  const tanzaniaDomsUnitPrice = isTanzania
    ? getTanzaniaDomsUnitPrice(transaction)
    : null
  const receiptTransactionLines =
    isTanzania && tanzaniaDomsUnitPrice != null
      ? transactionLines.map((line, index) => ({
          ...line,
          unit_price: tanzaniaDomsUnitPrice,
          line_total:
            transactionLines.length === 1
              ? transaction.total_amount
              : Number(line.quantity || 0) * tanzaniaDomsUnitPrice,
          doms_unit_price: tanzaniaDomsUnitPrice,
          doms_price_authoritative: true,
          line_index: index,
        }))
      : transactionLines
  const canonicalFiscalization = resolveCanonicalFiscalizationPayload({
    eventResponsePayload: latestFiscalEvent?.response_payload,
    legacyTransactionResponse: transaction?.fiscalization_response,
  })
  const rawResponse = isTanzania
    ? (storedReceipt?.fiscal_data ?? canonicalFiscalization.payload)
    : canonicalFiscalization.payload
  const storedBranding = normalizeReceiptBrandingSnapshot(
    storedReceipt?.branding_snapshot,
  )
  const presentation = storedReceipt
    ? resolveReceiptContent({
        plainTextContent: storedReceipt.plain_text_content,
        htmlContent: storedReceipt.html_content,
        renderVersion: storedReceipt.render_version,
      })
    : null
  const receiptBranding = storedBranding
    ? {
        logoPath: storedBranding.logoPath,
        primaryColor: storedBranding.primaryColor,
        secondaryColor: storedBranding.secondaryColor,
        stationDisplayName: storedBranding.stationDisplayName,
        receiptHeaderText: storedBranding.receiptHeaderText,
        receiptFooterText: storedBranding.receiptFooterText,
      }
    : branding
      ? {
          logoPath: (branding as any)?.logo_path ?? null,
          primaryColor: (branding as any)?.primary_color ?? null,
          secondaryColor: (branding as any)?.secondary_color ?? null,
          stationDisplayName: (branding as any)?.station_display_name ?? null,
          receiptHeaderText: (branding as any)?.receipt_header_text ?? null,
          receiptFooterText: (branding as any)?.receipt_footer_text ?? null,
        }
      : undefined
  const receipt = normalizeReceipt({
    transaction: {
      ...transaction,
      product_code: fallbackProduct?.product_code ?? transaction.product_code,
      sku: fallbackProduct?.sku ?? transaction.sku,
      tax_code: fallbackProduct?.tax_code ?? transaction.tax_code,
      tax_rate: fallbackProduct?.tax_rate ?? transaction.tax_rate,
    },
    stationName: station?.name,
    station,
    stationTaxNumber,
    stationPin,
    transactionLines: receiptTransactionLines,
    raw: rawResponse,
    attendantName: input.attendantName,
    decimalOverrides: {
      volume: decimalValue(stationSettings?.volume_decimals),
      money: decimalValue(stationSettings?.money_decimals),
      unitPrice: decimalValue(stationSettings?.unit_price_decimals),
    },
    allowUnfiscalizedPreview: input.previewMode,
    titleOverride: input.previewMode ? 'RECEIPT PREVIEW' : undefined,
    branding: receiptBranding,
  })
  const tanzaniaProxyMetadata = isTanzania
    ? extractTanzaniaProxyReceiptMetadata(latestFiscalEvent?.request_payload)
    : null
  const tanzaniaProxyReceipt = isTanzania
    ? mapFiscalReceipt(latestFiscalEvent?.response_payload)
    : null
  if (receipt && isTanzania) {
    if (receipt.buyer) {
      receipt.buyer.buyerType = resolveTanzaniaCustomerIdentity({
        tin: receipt.buyer.tin,
      }).customerIdType
    }
    const verificationCode = firstNonEmpty(
      tanzaniaProxyReceipt?.fiscalVerificationCode,
      tanzaniaProxyMetadata?.receiptVerificationNumber,
    )
    if (verificationCode) {
      receipt.footer.fiscalVerificationCode = verificationCode
    }
    receipt.footer.fiscalQrCodeData =
      firstNonEmpty(
        tanzaniaProxyReceipt?.fiscalQrCodeData,
        tanzaniaProxyMetadata?.receiptVerificationNumber
          ? buildTanzaniaReceiptVerificationUrl({
              receiptVerificationNumber:
                tanzaniaProxyMetadata.receiptVerificationNumber,
              mode: stationSettings?.tanzania_receipt_verification_prefix_mode,
              invoiceDate: tanzaniaProxyMetadata.invoiceDate,
              receiptTime: tanzaniaProxyReceipt?.receiptTime,
            })
          : null,
        receipt.footer.fiscalQrCodeData,
      ) ?? receipt.footer.fiscalQrCodeData
    const zNumber = firstNonEmpty(
      tanzaniaProxyReceipt?.receiptZNumber,
      tanzaniaProxyMetadata?.zNumber,
    )
    if (zNumber) {
      receipt.meta.receiptZNumber = zNumber
    }
    const receiptCounter = firstNonEmpty(
      tanzaniaProxyReceipt?.receiptNumber,
      tanzaniaProxyMetadata?.globalCounter,
    )
    if (receiptCounter) {
      receipt.meta.receiptNumber = receiptCounter
      receipt.meta.receiptTraNumber = receiptCounter
    }
    if (tanzaniaProxyReceipt?.receiptDate) {
      receipt.meta.receiptDate = tanzaniaProxyReceipt.receiptDate
    }
    if (tanzaniaProxyReceipt?.receiptTime) {
      receipt.meta.receiptTime = tanzaniaProxyReceipt.receiptTime
    }
    if (tanzaniaProxyReceipt?.documentNumber) {
      receipt.meta.documentNumber = tanzaniaProxyReceipt.documentNumber
    }
    if (tanzaniaProxyReceipt?.companyName) {
      receipt.header.companyName = tanzaniaProxyReceipt.companyName
      receipt.header.stationName = tanzaniaProxyReceipt.companyName
    }
    if (tanzaniaProxyReceipt?.companyTin) {
      receipt.header.companyTin = tanzaniaProxyReceipt.companyTin
    }
    if (tanzaniaProxyReceipt?.companyVrn) {
      receipt.header.companyVrn = tanzaniaProxyReceipt.companyVrn
    }
    if (tanzaniaProxyReceipt?.companyMobile) {
      receipt.header.companyMobile = tanzaniaProxyReceipt.companyMobile
    }
    if (tanzaniaProxyReceipt?.companySerial) {
      receipt.header.companySerial = tanzaniaProxyReceipt.companySerial
    }
    if (tanzaniaProxyReceipt?.companyTaxOffice) {
      receipt.header.companyTaxOffice = tanzaniaProxyReceipt.companyTaxOffice
    }
    if (tanzaniaProxyReceipt?.receiptInternalData) {
      receipt.footer.receiptInternalData =
        tanzaniaProxyReceipt.receiptInternalData
    }
    if (tanzaniaProxyReceipt?.receiptSignature) {
      receipt.footer.receiptSignature = tanzaniaProxyReceipt.receiptSignature
    }
  }
  if (!receipt) {
    return {
      found: false,
      error: 'Receipt not found in fiscalization event or legacy data',
      raw: rawResponse ?? null,
    }
  }

  const payload: ReceiptRoutePayload = {
    ok: true,
    receipt,
    raw: rawResponse ?? null,
  }
  if (storedReceipt && presentation) {
    payload.presentation = {
      receiptId: String(storedReceipt.id),
      receiptNumber: String(storedReceipt.receipt_number),
      plainTextContent: presentation.plainTextContent,
      htmlContent: presentation.htmlContent,
      renderVersion: presentation.renderVersion,
      generatedAt: storedReceipt.generated_at ?? null,
    }
  }
  try {
    const voidedRow = await queryOne<{ voided_at: string | null }>(
      'SELECT voided_at FROM receipts WHERE station_id = $1 AND transaction_id = $2::uuid AND voided_at IS NOT NULL LIMIT 1',
      [input.stationId, input.transactionId],
    )
    if (voidedRow?.voided_at) {
      payload.voided = true
      payload.voidedAt = voidedRow.voided_at
    }
  } catch {
    // The column may not exist before migration 047.
  }
  return { found: true, payload }
}

export async function listReceiptRouteRows(
  stationId: string,
  transactionId: string,
) {
  const rows = await queryAll<Record<string, any>>(
    `SELECT r.*
       FROM receipts r
      WHERE r.station_id = $1
        AND ($2 = '' OR r.transaction_id = $2::uuid)
      ORDER BY r.generated_at DESC
      LIMIT 200`,
    [stationId, transactionId],
  )
  return rows.map((row) => resolveReceiptRowContent(row))
}
