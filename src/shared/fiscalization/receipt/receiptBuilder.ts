import { queryOne as pgOne } from '@/src/platform/db/postgres'
import { toNumberLoose as coerceNumber } from '@/src/shared/numbers'
import { resolveDecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { mapFiscalReceipt } from '@/src/shared/receipts/mapFiscalReceipt'
import { formatDateTime } from '@/src/shared/utils/dates'

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
} from './types'
import { buildReceiptLines as buildDefaultLines } from './templates/DEFAULT'
import { buildReceiptLines as buildKeLines } from './templates/KE'
import { buildReceiptLines as buildTzLines } from './templates/TZ'

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
        taxCode: 'B',
        quantity: fbQty,
        unitPrice: fbUnitPrice,
        amount: fbAmount,
      },
    ]
  }

  return baseItems.map((item) => {
    const quantity = Number(
      coerceNumber(item?.qty ?? item?.quantity ?? item?.volume) ?? 1,
    )
    const unitPrice = Number(
      coerceNumber(item?.unit_price ?? item?.unitPrice ?? item?.price) ?? 0,
    )
    const amount = Number(
      coerceNumber(item?.amount ?? item?.total ?? item?.lineTotal) ??
        (quantity ? unitPrice * quantity : 0),
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
        item?.fuelType,
        item?.fuel_type,
        'Item',
      ),
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
    const taxAmount = (amount * rate) / 100
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
      output.push(line.value.slice(0, width))
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

const renderReceiptHtml = (text: string) => {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Receipt</title></head>
<body>
<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; line-height:1.4;">${escaped}</pre>
</body>
</html>`
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
       AND (transaction_id = $2::uuid OR payload->>'transactionId' = $2::text OR payload->>'transaction_id' = $2::text)
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.stationId, params.transactionId],
  )

  const transactionLines = await pgOne<any>(
    `SELECT jsonb_agg(
        jsonb_build_object(
          'quantity', tl.quantity,
          'unit_price', COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price),
          'line_total', (tl.quantity * COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price)),
          'product_name', p.product_name,
          'tax_code', COALESCE(p.ext_tax_code, p.tax_code),
          'tax_rate', p.tax_rate
        )
      ) AS lines
     FROM transaction_lines tl
     LEFT JOIN products p
       ON p.id = tl.product_id
      AND p.station_id = $1
     WHERE tl.transaction_id = $2::uuid`,
    [params.stationId, params.transactionId],
  )

  const fiscalResponse = safeParse(txn.fiscalization_response)
  const fiscalSource = extractSource(fiscalResponse)
  const templateModel = mapFiscalReceipt(fiscalResponse)

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
    name: station?.name || 'Station',
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
  }

  const customerInfo: ReceiptCustomer = {
    name: pickFirst(
      customer?.buyer_name,
      customer?.buyerName,
      customer?.trade_name,
      customer?.business_name,
      'Walk-in Customer',
    ),
    tin: pickFirst(
      customer?.tin,
      queuePayload?.payload?.tin,
      fiscalSource?.customer_tin,
      'N/A',
    ),
    buyerType:
      coerceString(customer?.buyer_type ?? customer?.buyerType) ?? null,
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
  }

  const items = extractItems(
    queuePayload?.payload,
    fiscalSource,
    txn,
    transactionLines?.lines,
  )
  const taxSummary = buildTaxSummary(
    items,
    stationInfo.country,
    stationSettings,
  )

  const normalizePaymentMethod = (value: any) => {
    const raw = coerceString(value)
    if (!raw) return null
    const upper = raw.toUpperCase()
    if (upper === 'CARD') return 'Card'
    if (upper === 'CASH') return 'Cash'
    return raw
  }

  const payment: ReceiptPayment = {
    method:
      normalizePaymentMethod(txn.payment_type) ??
      normalizePaymentMethod(queuePayload?.payload?.paymentType) ??
      normalizePaymentMethod(queuePayload?.payload?.payment_type) ??
      normalizePaymentMethod(fiscalSource?.payment_method) ??
      normalizePaymentMethod(fiscalSource?.paymentMethod) ??
      'Cash',
    amount: Number(coerceNumber(txn.total_amount) ?? 0),
    itemsCount: items.length,
    currency:
      coerceString(
        fiscalSource?.currency ?? fiscalSource?.currencyCode ?? null,
      ) ?? 'Ksh',
  }

  const receiptNumber = `R-${Date.now()}-${String(txn.id).slice(0, 6)}`

  const fiscalMeta: FiscalMeta = {
    scuId: pickFirst(
      fiscalSource?.scu_id,
      fiscalSource?.device_id,
      fiscalDevice?.config_json?.cloud_device_id,
      fiscalDevice?.config_json?.device_id,
      fiscalDevice?.config_json?.scu_id,
    ),
    cuInvoiceNo: pickFirst(
      fiscalSource?.cu_invoice_no,
      fiscalSource?.cuInvoiceNo,
      fiscalSource?.fiscal_number,
      fiscalSource?.fiscalNumber,
    ),
    receiptNumber,
    internalData: pickFirst(
      fiscalSource?.internal_data,
      fiscalSource?.hash,
      fiscalSource?.encoded,
      fiscalSource?.signature_hash,
    ),
    signature: pickFirst(
      fiscalSource?.signature,
      fiscalSource?.receipt_signature,
      fiscalSource?.receiptSignature,
    ),
  }

  const verificationUrl = pickFirst(
    fiscalSource?.verification_url,
    fiscalSource?.verificationUrl,
    fiscalSource?.qr_url,
  )

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
    qrPayload: qrData ? { data: qrData, verificationUrl } : null,
    decimals,
  }

  const lines = buildLinesForCountry(stationInfo.country, model)
  const text = renderReceiptText(lines, WIDTH)
  const html = renderReceiptHtml(text)

  return {
    model,
    lines,
    text,
    html,
    receiptNumber,
    templateModel,
  }
}
