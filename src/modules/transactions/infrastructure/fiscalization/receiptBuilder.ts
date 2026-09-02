import type {
  FiscalMeta,
  FiscalReceiptModel,
  PrintableLine,
  ReceiptCustomer,
  ReceiptItem,
  ReceiptPayment,
  ReceiptStation,
  ReceiptTransaction,
  TaxSummaryLine,
} from '@/src/shared/fiscalization/receipt/types'

import { queryOne as pgOne } from '@/src/platform/db/postgres'
import { buildReceiptLines as buildDefaultLines } from '@/src/shared/fiscalization/receipt/templates/DEFAULT'
import { buildReceiptLines as buildKeLines } from '@/src/shared/fiscalization/receipt/templates/KE'
import { buildReceiptLines as buildTzLines } from '@/src/shared/fiscalization/receipt/templates/TZ'
import { toNumberLoose as coerceNumber } from '@/src/shared/numbers'
import { resolveDecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { mapFiscalReceipt } from '@/src/shared/receipts/mapFiscalReceipt'
import { formatDateTime } from '@/src/shared/utils/dates'

import { resolveTanzaniaCustomerIdentity } from '@/src/modules/tanzania-fiscal/domain/customerIdentity'
import { extractTanzaniaProxyReceiptMetadata } from '@/src/modules/tanzania-fiscal/domain/proxyReceiptMetadata'
import { buildTanzaniaReceiptVerificationUrl } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'
import { resolveCanonicalFiscalizationPayload } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-read-compat'

const WIDTH = 42

const safeParse = (value: any) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

const coerceString = (value: any) => {
  const v = String(value ?? '').trim()
  return v.length ? v : null
}

const pickFirst = (...values: Array<any>) => {
  for (const value of values) {
    const v = coerceString(value)
    if (v) return v
  }
  return ''
}

const splitCustomLines = (value: unknown) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const parseXmlTag = (xml: unknown, tag: string) => {
  const value = String(xml ?? '')
  if (!value) return ''
  const match = value.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  )
  return match?.[1]?.trim() || ''
}

const dateAndTimeFallback = (value: unknown) => {
  const literal = String(value ?? '').trim()
  const literalMatch = literal.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/,
  )
  if (literalMatch) {
    return { date: literalMatch[1], time: literalMatch[2] }
  }
  const date = value ? new Date(String(value)) : null
  if (!date || Number.isNaN(date.getTime())) return { date: '', time: '' }
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 19),
  }
}

const scuIdFromReceiptNumber = (value: any) => {
  const receiptNumber = coerceString(value)
  if (!receiptNumber || !receiptNumber.includes('/')) return ''
  return receiptNumber.split('/')[0]?.trim() || ''
}

const extractSource = (raw: any) => {
  if (!raw || typeof raw !== 'object') return raw
  return (
    raw.receipt ||
    raw.receiptData ||
    raw.fiscalReceipt ||
    raw.data?.receipt ||
    raw.payload?.receipt ||
    raw
  )
}

const pickScuId = (raw: any, fiscalSource: any, fiscalDevice: any) => {
  const details =
    raw?.details ||
    raw?.data?.details ||
    raw?.payload?.details ||
    raw?.result?.details ||
    raw?.response?.details
  const data = raw?.data || raw?.payload || raw?.result || raw?.response
  const receipt =
    details?.receipt ||
    raw?.receipt ||
    raw?.receiptData ||
    raw?.fiscalReceipt ||
    data?.receipt ||
    data?.receiptData ||
    fiscalSource
  const device =
    raw?.device ||
    raw?.fiscalDevice ||
    raw?.fiscal_device ||
    data?.device ||
    data?.fiscalDevice ||
    data?.fiscal_device ||
    details?.device ||
    details?.fiscalDevice ||
    details?.fiscal_device ||
    receipt?.device ||
    receipt?.fiscalDevice ||
    receipt?.fiscal_device

  const receiptNumber = pickFirst(
    receipt?.receiptNumber,
    receipt?.receipt_number,
    details?.receiptNumber,
    details?.receipt_number,
    data?.receiptNumber,
    data?.receipt_number,
    raw?.receiptNumber,
    raw?.receipt_number,
  )

  return pickFirst(
    raw?.scu_id,
    raw?.scuId,
    raw?.scuID,
    raw?.SCUID,
    raw?.device_id,
    raw?.deviceId,
    data?.scu_id,
    data?.scuId,
    data?.scuID,
    data?.SCUID,
    data?.device_id,
    data?.deviceId,
    details?.scu_id,
    details?.scuId,
    details?.scuID,
    details?.SCUID,
    details?.device_id,
    details?.deviceId,
    fiscalSource?.scu_id,
    fiscalSource?.scuId,
    fiscalSource?.scuID,
    fiscalSource?.SCUID,
    fiscalSource?.device_id,
    fiscalSource?.deviceId,
    receipt?.scu_id,
    receipt?.scuId,
    receipt?.scuID,
    receipt?.SCUID,
    receipt?.device_id,
    receipt?.deviceId,
    device?.scu_id,
    device?.scuId,
    device?.scuID,
    device?.SCUID,
    device?.device_id,
    device?.deviceId,
    device?.cloud_device_id,
    device?.cloudDeviceId,
    fiscalDevice?.config_json?.cloud_device_id,
    fiscalDevice?.config_json?.cloudDeviceId,
    fiscalDevice?.config_json?.device_id,
    fiscalDevice?.config_json?.deviceId,
    fiscalDevice?.config_json?.scu_id,
    fiscalDevice?.config_json?.scuId,
    scuIdFromReceiptNumber(receiptNumber),
  )
}

const extractItems = (
  payload: any,
  fiscal: any,
  fallback: any,
  transactionLines?: any[] | null,
): ReceiptItem[] => {
  const dbLines = Array.isArray(transactionLines) ? transactionLines : []
  if (dbLines.length) {
    return dbLines.map((line) => {
      const quantity = Number(
        coerceNumber(line?.quantity ?? line?.qty ?? line?.volume) ?? 1,
      )
      const unitPrice = Number(
        coerceNumber(line?.unit_price ?? line?.unitPrice ?? line?.price) ?? 0,
      )
      const amount = Number(
        coerceNumber(line?.line_total ?? line?.amount ?? line?.total) ??
          (quantity ? unitPrice * quantity : 0),
      )
      const taxCode =
        coerceString(
          line?.tax_code ??
            line?.taxCode ??
            line?.ext_tax_code ??
            line?.extTaxCode,
        ) || 'B'
      return {
        name: pickFirst(
          line?.product_name,
          line?.productName,
          line?.description,
          line?.fuelType,
          line?.fuel_type,
          'Item',
        ),
        productCode:
          coerceString(
            line?.product_code ??
              line?.productCode ??
              line?.ext_product_code ??
              line?.extProductCode,
          ) ?? null,
        sku: coerceString(line?.sku) ?? null,
        taxCode: taxCode.toUpperCase(),
        quantity,
        unitPrice,
        amount,
        taxRate: coerceNumber(line?.tax_rate ?? line?.taxRate) ?? null,
        taxAmount:
          coerceNumber(
            line?.tax_amount ?? line?.taxAmount ?? line?.vatAmount,
          ) ?? null,
      }
    })
  }

  const itemsRaw: any[] =
    fiscal?.items ||
    fiscal?.lines ||
    fiscal?.lineItems ||
    payload?.items ||
    payload?.lines ||
    payload?.lineItems ||
    []

  const baseItems = Array.isArray(itemsRaw) ? itemsRaw : []
  if (!baseItems.length) {
    const fallbackName = pickFirst(
      fallback?.fuel_type,
      fallback?.fuelType,
      'Fuel',
    )
    const fbQty = Number(coerceNumber(fallback?.volume) ?? 1)
    const fbAmount = Number(coerceNumber(fallback?.total_amount) ?? 0)
    const fbUnitPrice = fbQty > 0 ? fbAmount / fbQty : fbAmount
    return [
      {
        name: fallbackName || 'Fuel',
        productCode:
          coerceString(
            fallback?.product_code ??
              fallback?.productCode ??
              fallback?.ext_product_code ??
              fallback?.extProductCode ??
              fallback?.grade_id ??
              fallback?.gradeId,
          ) ?? null,
        sku: coerceString(fallback?.sku) ?? null,
        taxCode: pickFirst(
          fallback?.tax_code,
          fallback?.taxCode,
          fallback?.ext_tax_code,
          fallback?.extTaxCode,
          'B',
        ).toUpperCase(),
        quantity: fbQty,
        unitPrice: fbUnitPrice,
        amount: fbAmount,
        taxRate: coerceNumber(fallback?.tax_rate ?? fallback?.taxRate) ?? null,
      },
    ]
  }

  return baseItems.map((item) => {
    const quantity = Number(
      coerceNumber(item?.qty ?? item?.quantity ?? item?.volume) ?? 1,
    )
    const isTraItem =
      item?.description != null && item?.price != null && item?.amount != null
    const traLineTotal = isTraItem
      ? Number(coerceNumber(item?.price ?? item?.amount) ?? 0)
      : null
    const unitPrice = Number(
      coerceNumber(
        isTraItem
          ? quantity
            ? Number(traLineTotal) / quantity
            : traLineTotal
          : (item?.unit_price ?? item?.unitPrice ?? item?.price),
      ) ?? 0,
    )
    const amount = Number(
      coerceNumber(
        isTraItem
          ? traLineTotal
          : (item?.amount ?? item?.total ?? item?.lineTotal),
      ) ?? (quantity ? unitPrice * quantity : 0),
    )
    const taxCode =
      coerceString(
        item?.tax_code ??
          item?.taxCode ??
          item?.tax_type ??
          item?.taxType ??
          item?.vatCode,
      ) || 'B'
    return {
      name: pickFirst(
        item?.name,
        item?.description,
        item?.product_name,
        item?.productName,
        item?.fuelType,
        item?.fuel_type,
        'Item',
      ),
      productCode:
        coerceString(
          item?.product_code ??
            item?.productCode ??
            item?.ext_product_code ??
            item?.extProductCode,
        ) ?? null,
      sku: coerceString(item?.sku) ?? null,
      taxCode: taxCode.toUpperCase(),
      quantity,
      unitPrice,
      amount,
      taxRate:
        coerceNumber(
          item?.tax_rate ?? item?.taxRate ?? item?.vat_rate ?? item?.vatRate,
        ) ?? null,
      taxAmount:
        coerceNumber(item?.tax_amount ?? item?.taxAmount ?? item?.vatAmount) ??
        null,
    }
  })
}

const taxLabel = (code: string) => {
  switch (code.toUpperCase()) {
    case 'A':
      return 'Exempt'
    case 'B':
      return 'VAT'
    case 'C':
      return 'Zero Rated'
    case 'D':
      return 'Non VAT'
    default:
      return 'Other'
  }
}

const defaultVatRate = (country?: string | null, stationSettings?: any) => {
  if (country === 'KE') return Number(stationSettings?.vat_rate_ke ?? 16)
  if (country === 'TZ') return Number(stationSettings?.vat_rate_tz ?? 18)
  return Number(stationSettings?.vat_rate_default ?? 16)
}

const buildTaxSummary = (
  items: ReceiptItem[],
  country?: string | null,
  stationSettings?: any,
): TaxSummaryLine[] => {
  const byCode = new Map<string, TaxSummaryLine>()
  const fallbackRate = defaultVatRate(country, stationSettings)

  items.forEach((item) => {
    const code = item.taxCode || 'B'
    const rate = Number(item.taxRate ?? fallbackRate)
    const amount = Number(item.amount ?? 0)
    const taxAmount =
      item.taxAmount != null && Number.isFinite(Number(item.taxAmount))
        ? Number(item.taxAmount)
        : amount - amount / (1 + rate / 100)
    const taxable = amount - taxAmount

    const existing = byCode.get(code)
    if (existing) {
      existing.taxableAmount += taxable
      existing.taxAmount += taxAmount
    } else {
      byCode.set(code, {
        taxCode: code,
        label: taxLabel(code),
        rate,
        taxableAmount: taxable,
        taxAmount,
      })
    }
  })

  return Array.from(byCode.values()).sort((a, b) =>
    a.taxCode.localeCompare(b.taxCode),
  )
}

const buildQrPayload = (opts: {
  fiscalDocumentId?: string | null
  receiptNumber: string
  verificationUrl?: string | null
}) => {
  const payload = {
    fiscal_document_id: opts.fiscalDocumentId ?? null,
    receipt_number: opts.receiptNumber,
    verification_url: opts.verificationUrl ?? null,
  }
  return JSON.stringify(payload)
}

const buildLinesForCountry = (
  country: string | null | undefined,
  model: FiscalReceiptModel,
): PrintableLine[] => {
  switch ((country || '').toUpperCase()) {
    case 'KE':
      return buildKeLines(model)
    case 'TZ':
      return buildTzLines(model)
    default:
      return buildDefaultLines(model)
  }
}

const renderReceiptText = (lines: PrintableLine[], width = WIDTH) => {
  const output: string[] = []
  const separator = '-'.repeat(width)

  lines.forEach((line) => {
    if (line.type === 'separator') {
      output.push(separator)
      return
    }
    if (line.type === 'empty') {
      const count = Math.max(1, line.lines ?? 1)
      for (let i = 0; i < count; i += 1) output.push('')
      return
    }
    if (line.type === 'qr') {
      output.push('[QR]')
      output.push(line.value)
      return
    }
    if (line.type === 'image') {
      output.push(`[IMAGE:${line.asset.toUpperCase().replace(/-/g, '_')}]`)
      return
    }

    if (line.align === 'center') {
      const pad = Math.max(0, Math.floor((width - line.value.length) / 2))
      output.push(`${' '.repeat(pad)}${line.value}`)
      return
    }
    if (line.align === 'right') {
      const pad = Math.max(0, width - line.value.length)
      output.push(`${' '.repeat(pad)}${line.value}`)
      return
    }
    output.push(line.value)
  })

  return output.join('\n')
}

export const buildFiscalReceipt = async (params: {
  stationId: string
  transactionId: string
}) => {
  const txn = await pgOne<any>(
    `SELECT * FROM transactions WHERE id = $1 AND station_id = $2`,
    [params.transactionId, params.stationId],
  )
  if (!txn) throw new Error('Transaction not found')

  const station = await pgOne<any>(
    `SELECT * FROM fuel_stations WHERE id = $1`,
    [params.stationId],
  )
  const stationSettings = await pgOne<any>(
    `SELECT * FROM station_settings WHERE station_id = $1`,
    [params.stationId],
  )
  const [branding, fiscalRegistration, fiscalEvent] = await Promise.all([
    pgOne<any>(
      `SELECT receipt_header_text, receipt_footer_text,
              station_display_name, logo_path
         FROM branding_settings
        WHERE station_id = $1`,
      [params.stationId],
    ).catch(() => null),
    pgOne<any>(
      `SELECT registration_json
         FROM fiscal_registration
        WHERE station_id = $1`,
      [params.stationId],
    ).catch(() => null),
    pgOne<any>(
      `SELECT engine, transport, request_payload, response_payload
         FROM fiscalization_events
        WHERE station_id = $1
          AND transaction_id = $2::uuid
          AND status = 'SUCCESS'
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT 1`,
      [params.stationId, params.transactionId],
    ).catch(() => null),
  ])

  const customer = txn.customer_id
    ? await pgOne<any>(`SELECT * FROM customers WHERE id = $1`, [
        txn.customer_id,
      ])
    : null

  const attendant = txn.allocated_by
    ? await pgOne<any>(`SELECT full_name FROM users WHERE id = $1`, [
        txn.allocated_by,
      ])
    : null

  const queuePayload = await pgOne<any>(
    `SELECT payload FROM transaction_queue
     WHERE station_id = $1
       AND (
         transaction_id = NULLIF(BTRIM(CAST($2 AS text)), '')::uuid
         OR payload->>'transactionId' = $2::text
         OR payload->>'transaction_id' = $2::text
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.stationId, params.transactionId],
  )

  const fallbackProduct = await pgOne<any>(
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
    [params.stationId, txn.grade_id, txn.grade_name, txn.fuel_type],
  )

  const transactionLines = await pgOne<any>(
    `SELECT jsonb_agg(
        jsonb_build_object(
          'quantity', tl.quantity,
          'unit_price', COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price),
          'line_total', (tl.quantity * COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price)),
          'product_name', p.product_name,
          'product_code', COALESCE(p.ext_product_code, p.product_code, t.grade_id),
          'sku', p.sku,
          'grade_id', t.grade_id,
          'tax_code', COALESCE(tl.tax_code, p.ext_tax_code, p.tax_code),
          'tax_rate', COALESCE(tl.tax_rate, p.tax_rate)
        )
      ) AS lines
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
     WHERE tl.transaction_id = NULLIF(BTRIM(CAST($2 AS text)), '')::uuid`,
    [params.stationId, params.transactionId],
  )

  const fiscalEventRequest = safeParse(fiscalEvent?.request_payload)
  const fiscalEventResponse = safeParse(fiscalEvent?.response_payload)
  const fiscalResponse = resolveCanonicalFiscalizationPayload({
    eventResponsePayload: fiscalEventResponse,
    legacyTransactionResponse: txn.fiscalization_response,
  }).payload as any
  const fiscalSource = extractSource(fiscalResponse)
  const templateModel = mapFiscalReceipt(fiscalResponse)
  const tanzaniaRequest =
    fiscalEventRequest?.tra ??
    fiscalResponse?.localTanzania?.tra?.request ??
    fiscalResponse?.tra?.request ??
    null
  const tanzaniaProxyMetadata =
    extractTanzaniaProxyReceiptMetadata(fiscalEventRequest)
  const tanzaniaCounters = tanzaniaRequest?.tra ?? {}
  const tanzaniaResponse =
    fiscalEventResponse?.tra ??
    fiscalResponse?.localTanzania?.tra?.response ??
    fiscalResponse?.tra ??
    {}
  const registrationJson = safeParse(fiscalRegistration?.registration_json)
  const tanzaniaRegistration =
    registrationJson?.data?.regData?.efdms?.efdmsresp ??
    registrationJson?.regData?.efdms?.efdmsresp ??
    {}
  const tanzaniaXml = tanzaniaRequest?.unsignedXml ?? tanzaniaRequest?.xml ?? ''
  const fallbackReceiptDateTime = dateAndTimeFallback(txn.transaction_date_time)
  const proxyReceiptDateTime = dateAndTimeFallback(
    tanzaniaProxyMetadata?.invoiceDate,
  )
  const tanzaniaReceiptDate =
    templateModel?.receiptDate ||
    parseXmlTag(tanzaniaXml, 'DATE') ||
    parseXmlTag(tanzaniaXml, 'RCT_DATE') ||
    proxyReceiptDateTime.date ||
    fallbackReceiptDateTime.date
  const tanzaniaReceiptTime =
    templateModel?.receiptTime ||
    parseXmlTag(tanzaniaXml, 'TIME') ||
    parseXmlTag(tanzaniaXml, 'RCT_TIME') ||
    proxyReceiptDateTime.time ||
    fallbackReceiptDateTime.time

  const stationKv = await pgOne<any>(
    `SELECT value FROM station_kv WHERE station_id = $1 AND key = $2`,
    [params.stationId, 'tax_pin'],
  )

  const fiscalDevice = await pgOne<any>(
    `SELECT config_json FROM fiscal_devices WHERE station_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1`,
    [params.stationId],
  )

  const stationCountry = String(station?.country ?? '')
    .trim()
    .toUpperCase()
  const stationInfo: ReceiptStation = {
    name:
      branding?.station_display_name ||
      (stationCountry === 'TZ' ? templateModel?.companyName : null) ||
      station?.name ||
      'Station',
    taxId:
      stationCountry === 'KE'
        ? pickFirst(
            station?.pin,
            stationKv?.value?.pin,
            stationKv?.value?.tax_pin,
            stationSettings?.tax_pin,
            fiscalResponse?.taxPin,
          )
        : pickFirst(
            templateModel?.companyTin,
            station?.tin,
            stationKv?.value?.tin,
            stationKv?.value?.tax_pin,
            stationSettings?.tin,
            stationSettings?.tax_pin,
            fiscalResponse?.tin,
            fiscalResponse?.taxTin,
            fiscalResponse?.taxPin,
          ),
    country: station?.country ?? null,
    mobile: pickFirst(
      stationCountry === 'TZ' ? templateModel?.companyMobile : null,
      tanzaniaRegistration?.mobile,
      station?.phone,
      station?.mobile,
    ),
    vrn: pickFirst(
      stationCountry === 'TZ' ? templateModel?.companyVrn : null,
      tanzaniaRegistration?.vrn,
      station?.vrn,
    ),
    serial: pickFirst(
      stationCountry === 'TZ' ? templateModel?.companySerial : null,
      tanzaniaRegistration?.serial,
      stationSettings?.vfd_serial_no,
    ),
    uin: pickFirst(tanzaniaRegistration?.uin, stationSettings?.uin),
    taxOffice: pickFirst(
      stationCountry === 'TZ' ? templateModel?.companyTaxOffice : null,
      tanzaniaRegistration?.taxoffice,
      tanzaniaRegistration?.taxOffice,
      stationSettings?.tax_office,
    ),
  }

  const customerTin = pickFirst(
    customer?.tin,
    queuePayload?.payload?.tin,
    fiscalSource?.customer_tin,
  )
  const tanzaniaCustomerIdentity = resolveTanzaniaCustomerIdentity({
    tin: customerTin,
  })
  const customerInfo: ReceiptCustomer = {
    name: pickFirst(
      customer?.buyer_name,
      customer?.buyerName,
      customer?.trade_name,
      customer?.business_name,
      'Walk-in Customer',
    ),
    tin: customerTin || 'N/A',
    buyerType:
      stationCountry === 'TZ'
        ? tanzaniaCustomerIdentity.customerIdType
        : (coerceString(customer?.buyer_type ?? customer?.buyerType) ?? null),
    phone:
      coerceString(
        customer?.contact_phone ??
          customer?.contactPhone ??
          customer?.contact_number,
      ) ?? null,
    email:
      coerceString(
        customer?.contact_email ?? customer?.contactEmail ?? customer?.email,
      ) ?? null,
    odometer: coerceString(txn.odometer) ?? null,
    paymentType:
      coerceString(txn.payment_type) ??
      coerceString(queuePayload?.payload?.paymentType) ??
      coerceString(queuePayload?.payload?.payment_type) ??
      null,
    vehicleRegNr:
      coerceString(txn.vehicle_reg_nr) ??
      coerceString(queuePayload?.payload?.vehicleRegNr) ??
      coerceString(queuePayload?.payload?.vehicle_reg_nr) ??
      null,
  }

  const invoiceNo = pickFirst(
    txn.pos_reference,
    fiscalSource?.invoice_no,
    fiscalSource?.invoiceNo,
    txn.id,
  )

  const fiscalReference = pickFirst(
    txn.fiscalization_reference,
    fiscalSource?.reference,
    fiscalSource?.fiscal_reference,
    'N/A',
  )

  const transactionInfo: ReceiptTransaction = {
    date: formatDateTime(txn.transaction_date_time),
    invoiceNo,
    fiscalReference,
    status: coerceString(txn.status) ?? null,
    attendant: coerceString(attendant?.full_name) ?? null,
    receiptDate: stationCountry === 'TZ' ? tanzaniaReceiptDate : null,
    receiptTime: stationCountry === 'TZ' ? tanzaniaReceiptTime : null,
    pumpNumber: pickFirst(
      txn.pump_number,
      queuePayload?.payload?.pumpNumber,
      queuePayload?.payload?.pump_number,
    ),
    nozzleNumber: pickFirst(
      txn.nozzle_number,
      queuePayload?.payload?.nozzleNumber,
      queuePayload?.payload?.nozzle_number,
    ),
  }

  const items = extractItems(
    queuePayload?.payload,
    stationCountry === 'TZ' && tanzaniaRequest ? tanzaniaRequest : fiscalSource,
    {
      ...txn,
      product_code: fallbackProduct?.product_code ?? txn.product_code,
      sku: fallbackProduct?.sku ?? txn.sku,
      tax_code: fallbackProduct?.tax_code ?? txn.tax_code,
      tax_rate: fallbackProduct?.tax_rate ?? txn.tax_rate,
    },
    transactionLines?.lines,
  )
  const tanzaniaVatTotals = Array.isArray(tanzaniaRequest?.vatTotals)
    ? tanzaniaRequest.vatTotals
    : []
  const taxSummary: TaxSummaryLine[] =
    stationCountry === 'TZ' && tanzaniaVatTotals.length
      ? tanzaniaVatTotals.map((entry: any) => ({
          taxCode: pickFirst(entry?.vatRate, 'B').toUpperCase(),
          label: taxLabel(pickFirst(entry?.vatRate, 'B')),
          rate: Number(coerceNumber(entry?.vatRateText) ?? 18),
          taxableAmount: Number(coerceNumber(entry?.nettAmount) ?? 0),
          taxAmount: Number(coerceNumber(entry?.taxAmount) ?? 0),
        }))
      : buildTaxSummary(items, stationInfo.country, stationSettings)

  const normalizePaymentMethod = (value: any) => {
    const raw = coerceString(value)
    if (!raw) return null
    const upper = raw.toUpperCase()
    if (upper === 'CARD') return 'Card'
    if (upper === 'CASH') return 'Cash'
    return raw
  }

  const tanzaniaPayment = Array.isArray(tanzaniaRequest?.payments)
    ? tanzaniaRequest.payments[0]
    : null
  const payment: ReceiptPayment = {
    method:
      normalizePaymentMethod(tanzaniaPayment?.type) ??
      normalizePaymentMethod(txn.payment_type) ??
      normalizePaymentMethod(queuePayload?.payload?.paymentType) ??
      normalizePaymentMethod(queuePayload?.payload?.payment_type) ??
      normalizePaymentMethod(fiscalSource?.payment_method) ??
      normalizePaymentMethod(fiscalSource?.paymentMethod) ??
      'Cash',
    amount: Number(
      coerceNumber(tanzaniaRequest?.totals?.totalIncludingTax) ??
        coerceNumber(txn.total_amount) ??
        0,
    ),
    itemsCount: items.length,
    currency:
      coerceString(
        fiscalSource?.currency ?? fiscalSource?.currencyCode ?? null,
      ) ?? (stationCountry === 'TZ' ? 'TZS' : 'Ksh'),
    discount: coerceNumber(tanzaniaRequest?.totals?.discount) ?? 0,
  }

  const fallbackReceiptNumber = `R-${Date.now()}-${String(txn.id).slice(0, 6)}`
  const receiptNumber = pickFirst(
    stationCountry === 'TZ' ? templateModel?.receiptNumber : null,
    stationCountry === 'TZ' ? tanzaniaCounters?.receiptNo : null,
    stationCountry === 'TZ' ? tanzaniaCounters?.globalCount : null,
    stationCountry === 'TZ' ? tanzaniaProxyMetadata?.globalCounter : null,
    templateModel?.receiptNumber,
    fiscalSource?.receiptNumber,
    fiscalSource?.receipt_number,
    fiscalSource?.receiptNo,
    fiscalSource?.receipt_no,
    fiscalSource?.number,
    fallbackReceiptNumber,
  )

  const verificationUrl = pickFirst(
    stationCountry === 'TZ' ? templateModel?.fiscalQrCodeData : null,
    tanzaniaCounters?.verificationUrl,
    tanzaniaResponse?.verificationUrl,
    fiscalSource?.verification_url,
    fiscalSource?.verificationUrl,
    fiscalSource?.qr_url,
    stationCountry === 'TZ' && tanzaniaProxyMetadata?.receiptVerificationNumber
      ? buildTanzaniaReceiptVerificationUrl({
          receiptVerificationNumber:
            tanzaniaProxyMetadata.receiptVerificationNumber,
          mode: stationSettings?.tanzania_receipt_verification_prefix_mode,
          invoiceDate: tanzaniaProxyMetadata.invoiceDate,
          receiptTime: tanzaniaReceiptTime,
        })
      : null,
  )

  const fiscalMeta: FiscalMeta = {
    scuId: pickScuId(fiscalResponse, fiscalSource, fiscalDevice),
    cuInvoiceNo: pickFirst(
      fiscalSource?.cu_invoice_no,
      fiscalSource?.cuInvoiceNo,
      fiscalSource?.fiscal_number,
      fiscalSource?.fiscalNumber,
    ),
    receiptNumber,
    internalData: pickFirst(
      templateModel?.receiptInternalData,
      fiscalSource?.internal_data,
      fiscalSource?.hash,
      fiscalSource?.encoded,
      fiscalSource?.signature_hash,
    ),
    signature: pickFirst(
      templateModel?.receiptSignature,
      fiscalSource?.signature,
      fiscalSource?.receipt_signature,
      fiscalSource?.receiptSignature,
    ),
    traReceiptNumber: pickFirst(
      templateModel?.receiptNumber,
      tanzaniaCounters?.receiptNo,
      tanzaniaProxyMetadata?.globalCounter,
    ),
    dailyCount: pickFirst(
      tanzaniaCounters?.dailyCount,
      tanzaniaProxyMetadata?.dailyCounter,
    ),
    globalCount: pickFirst(
      tanzaniaCounters?.globalCount,
      tanzaniaProxyMetadata?.globalCounter,
    ),
    zNumber: pickFirst(
      templateModel?.receiptZNumber,
      tanzaniaCounters?.znum,
      tanzaniaProxyMetadata?.zNumber,
    ),
    verificationCode: pickFirst(
      templateModel?.fiscalVerificationCode,
      tanzaniaCounters?.receiptVerificationNo,
      tanzaniaCounters?.verificationCode,
      tanzaniaProxyMetadata?.receiptVerificationNumber,
      txn.fiscalization_reference,
    ),
    verificationUrl: pickFirst(
      templateModel?.fiscalQrCodeData,
      tanzaniaCounters?.verificationUrl,
      tanzaniaResponse?.verificationUrl,
    ),
  }

  const qrData = buildQrPayload({
    fiscalDocumentId: coerceString(txn.fiscal_document_id) ?? null,
    receiptNumber,
    verificationUrl,
  })

  const decimals = resolveDecimalSettings({
    volume:
      typeof stationSettings?.volume_decimals === 'number'
        ? stationSettings.volume_decimals
        : undefined,
    money:
      typeof stationSettings?.money_decimals === 'number'
        ? stationSettings.money_decimals
        : undefined,
    unitPrice:
      typeof stationSettings?.unit_price_decimals === 'number'
        ? stationSettings.unit_price_decimals
        : undefined,
  })

  const model: FiscalReceiptModel = {
    station: stationInfo,
    transaction: transactionInfo,
    customer: customerInfo,
    items,
    taxSummary,
    payment,
    fiscalMeta,
    qrPayload: verificationUrl
      ? {
          data: stationCountry === 'TZ' ? verificationUrl : qrData,
          verificationUrl,
        }
      : qrData
        ? { data: qrData, verificationUrl }
        : null,
    customization: {
      headerLines: splitCustomLines(branding?.receipt_header_text),
      footerLines: splitCustomLines(branding?.receipt_footer_text),
      logoPath: branding?.logo_path ?? null,
    },
    decimals,
  }

  const lines = buildLinesForCountry(stationInfo.country, model)
  const text = renderReceiptText(lines, WIDTH)

  return {
    model,
    lines,
    text,
    receiptNumber,
    templateModel,
  }
}
